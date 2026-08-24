const pool = require('../db/pool');

/**
 * Upserts one row in cve_analysis by cve_id. Called both on success (full
 * analysis fields populated) and on failure (only status + errorMessage set)
 * so a failure record is visibly distinct from a successful-but-empty one.
 */
async function upsertAnalysis({
  cveId,
  simplifiedDescription = null,
  exploitabilityLevel = null,
  exploitabilityRationale = null,
  potentialImpact = null,
  remediationRecommendations = null,
  modelId = null,
  promptVersion = null,
  status,
  errorMessage = null,
  rawResponse = null,
}) {
  await pool.query(
    `
    INSERT INTO cve_analysis (
      cve_id, simplified_description, exploitability_level, exploitability_rationale,
      potential_impact, remediation_recommendations, model_id, prompt_version, status, error_message,
      raw_model_response, analyzed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
    ON CONFLICT (cve_id) DO UPDATE SET
      simplified_description      = EXCLUDED.simplified_description,
      exploitability_level        = EXCLUDED.exploitability_level,
      exploitability_rationale    = EXCLUDED.exploitability_rationale,
      potential_impact            = EXCLUDED.potential_impact,
      remediation_recommendations = EXCLUDED.remediation_recommendations,
      model_id                    = EXCLUDED.model_id,
      prompt_version               = EXCLUDED.prompt_version,
      status                      = EXCLUDED.status,
      error_message                = EXCLUDED.error_message,
      raw_model_response          = EXCLUDED.raw_model_response,
      analyzed_at                 = now()
    `,
    [
      cveId,
      simplifiedDescription,
      exploitabilityLevel,
      exploitabilityRationale,
      potentialImpact,
      remediationRecommendations ? JSON.stringify(remediationRecommendations) : null,
      modelId,
      promptVersion,
      status,
      errorMessage,
      rawResponse,
    ]
  );
}

async function findByCveId(cveId) {
  const { rows } = await pool.query('SELECT * FROM cve_analysis WHERE cve_id = $1', [cveId]);
  return rows[0] || null;
}

async function list({ status, page = 0, size = 20 }) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }

  params.push(size, page * size);

  const { rows } = await pool.query(
    `SELECT * FROM cve_analysis ${where} ORDER BY analyzed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = { upsertAnalysis, findByCveId, list };
