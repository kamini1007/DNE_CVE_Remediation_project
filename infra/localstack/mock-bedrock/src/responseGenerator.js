/**
 * Generates a schema-valid fake analysis response, loosely driven by whatever
 * CVSS score/CVE ID it can find in the incoming prompt text - not a real
 * model, just enough signal-following behavior to make local E2E smoke tests
 * meaningful (e.g. a CVSS 9.8 CVE reliably comes back HIGH/CRITICAL here, not
 * a fixed canned value regardless of input).
 */

const CVE_ID_PATTERN = /CVE-\d{4}-\d{4,7}/i;
const CVSS_SCORE_PATTERN = /CVSS v3 Score:\s*([\d.]+)/i;

function extractCveId(promptText) {
  const match = promptText.match(CVE_ID_PATTERN);
  return match ? match[0] : 'UNKNOWN-CVE';
}

function extractCvssScore(promptText) {
  const match = promptText.match(CVSS_SCORE_PATTERN);
  return match ? parseFloat(match[1]) : null;
}

function levelForScore(score) {
  if (score === null) return 'MEDIUM';
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  return 'LOW';
}

function generateAnalysis(promptText) {
  const cveId = extractCveId(promptText);
  const cvssScore = extractCvssScore(promptText);
  const level = levelForScore(cvssScore);

  const priorityForLevel = { CRITICAL: 'IMMEDIATE', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

  return {
    simplifiedDescription:
      `[mock-bedrock] ${cveId} is a mock analysis generated for local testing, not a real ` +
      `AI assessment. Its CVSS score (${cvssScore ?? 'not provided'}) maps to a ${level} exploitability level here.`,
    exploitabilityLevel: level,
    exploitabilityRationale:
      `[mock-bedrock] Derived purely from the CVSS score in the prompt (heuristic bucketing, not real analysis).`,
    potentialImpact:
      `[mock-bedrock] Placeholder impact statement for ${cveId} - replace mock-bedrock with real AWS Bedrock for actual impact assessments.`,
    remediationRecommendations: [
      { step: `[mock-bedrock] Apply the vendor patch for ${cveId} once available`, priority: priorityForLevel[level] },
      { step: '[mock-bedrock] Review network exposure for affected systems', priority: 'MEDIUM' },
    ],
  };
}

module.exports = { generateAnalysis, extractCveId, extractCvssScore, levelForScore };
