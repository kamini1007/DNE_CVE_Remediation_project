const config = require('../config/config');
const calibrationRepository = require('../repository/calibrationRepository');

/**
 * Generates a calibration report: current risk-level and prompt-version
 * stats, plus plain-language recommendations for a human to review.
 *
 * Deliberately NOT auto-tuning: this service never writes to
 * risk-engine.weights or ai-analysis-service's SYSTEM_PROMPT. There's no
 * trained model anywhere in this pipeline to retrain - risk scoring is a
 * weighted formula, and analysis is an LLM call - so "continuous learning"
 * here means surfacing calibration signal for a person to act on, not an
 * autonomous feedback loop. Auto-adjusting a security tool's risk scoring
 * based on a handful of noisy analyst ratings would be worse than not
 * adjusting it at all.
 */
async function generateReport() {
  const [riskLevelStats, promptVersionStats] = await Promise.all([
    calibrationRepository.getRiskLevelStats(),
    calibrationRepository.getPromptVersionStats(),
  ]);

  const recommendations = [
    ...riskLevelRecommendations(riskLevelStats),
    ...promptVersionRecommendations(promptVersionStats),
  ];

  return calibrationRepository.saveReport({ riskLevelStats, promptVersionStats, recommendations });
}

function riskLevelRecommendations(stats) {
  const { minSampleSize, ratingThreshold, slaThreshold } = config.calibration;
  const recommendations = [];

  for (const stat of stats) {
    if (stat.feedbackCount >= minSampleSize && stat.avgRating !== null && stat.avgRating < ratingThreshold) {
      recommendations.push({
        severity: 'warning',
        message:
          `Analysts rate risk scoring for ${stat.level} CVEs poorly (${stat.avgRating}/5 over ${stat.feedbackCount} responses). ` +
          `Consider reviewing risk-engine.weights or the asset profiles for commonly-affected vendors/products - ` +
          `see risk-engine-service/README.md for the scoring formula. This requires a manual change; nothing was auto-adjusted.`,
      });
    }

    if (stat.resolvedCount >= minSampleSize && stat.slaMetRate !== null && stat.slaMetRate < slaThreshold) {
      recommendations.push({
        severity: 'warning',
        message:
          `Only ${Math.round(stat.slaMetRate * 100)}% of resolved ${stat.level} remediations met their playbook's own SLA ` +
          `(${stat.resolvedCount} resolved tickets). This may mean the SLA window (${slaSourceHint(stat.level)}) is unrealistic ` +
          `for actual team capacity, or that ${stat.level} prioritization needs review.`,
      });
    }
  }

  return recommendations;
}

function promptVersionRecommendations(stats) {
  const { minSampleSize, ratingThreshold } = config.calibration;
  return stats
    .filter((s) => s.feedbackCount >= minSampleSize && s.avgRating < ratingThreshold)
    .map((s) => ({
      severity: 'warning',
      message:
        `AI analysis quality for prompt version ${s.promptVersion} is rated poorly (${s.avgRating}/5 over ${s.feedbackCount} responses). ` +
        `Consider revising SYSTEM_PROMPT in ai-analysis-service/src/prompts/cveAnalysisPrompt.js and bumping PROMPT_VERSION so future ` +
        `feedback can confirm whether the revision helped.`,
    }));
}

function slaSourceHint(level) {
  const hours = { CRITICAL: '24h', HIGH: '72h', MEDIUM: '2 weeks', LOW: '30 days' };
  return hours[level] || 'see remediation-service/src/services/playbookService.js';
}

module.exports = { generateReport };
