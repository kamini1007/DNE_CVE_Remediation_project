const VALID_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']);
const VALID_PRIORITIES = new Set(['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * The model is instructed to return raw JSON, but occasionally wraps it in
 * ```json fences anyway - strip those defensively before parsing. Any field
 * that doesn't match the expected shape is coerced to a safe default rather
 * than causing the whole analysis to fail.
 */
function parseAnalysisResponse(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Model response was not valid JSON: ${err.message}`);
  }

  const level = VALID_LEVELS.has(parsed.exploitabilityLevel) ? parsed.exploitabilityLevel : 'UNKNOWN';

  const recommendations = Array.isArray(parsed.remediationRecommendations)
    ? parsed.remediationRecommendations
        .filter((r) => r && typeof r.step === 'string')
        .map((r) => ({
          step: r.step,
          priority: VALID_PRIORITIES.has(r.priority) ? r.priority : 'MEDIUM',
        }))
    : [];

  return {
    simplifiedDescription: typeof parsed.simplifiedDescription === 'string' ? parsed.simplifiedDescription : null,
    exploitabilityLevel: level,
    exploitabilityRationale: typeof parsed.exploitabilityRationale === 'string' ? parsed.exploitabilityRationale : null,
    potentialImpact: typeof parsed.potentialImpact === 'string' ? parsed.potentialImpact : null,
    remediationRecommendations: recommendations,
  };
}

module.exports = { parseAnalysisResponse };
