const pool = require('../db/pool');

/**
 * Upserts one row in cve_analysis by cve_id. Called both on success (full
 * analysis fields populated) and on failure (only status + errorMessage set)
 * so a failure record is visibly distinct from a successful-but-empty one.
 *
 * PORTABLE REWRITE: previously used PostgreSQL's `ON CONFLICT ... DO UPDATE`,
 * which H2 does not support (confirmed - H2 only supports the more limited
 * `ON CONFLICT DO NOTHING`, not the DO UPDATE form). Replaced with an
 * explicit check-then-insert-or-update inside a transaction, using a single
 * checked-out client rather than pool.query() so the SELECT and the
 * INSERT/UPDATE that follows it are never interleaved with another
 * concurrent upsert for the same cve_id.
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
  const recommendationsJson = remediationRecommendations ? JSON.stringify(remediationRecommendations) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query('SELECT cve_id FROM cve_analysis WHERE cve_id = $1', [cveId]);

    if (existing.length > 0) {
      await client.query(
        `
        UPDATE cve_analysis SET
          simplified_description      = $2,
          exploitability_level        = $3,
          exploitability_rationale    = $4,
          potential_impact            = $5,
          remediation_recommendations = $6,
          model_id                    = $7,
          prompt_version              = $8,
          status                      = $9,
          error_message               = $10,
          raw_model_response          = $11,
          analyzed_at                 = now()
        WHERE cve_id = $1
        `,
        [
          cveId,
          simplifiedDescription,
          exploitabilityLevel,
          exploitabilityRationale,
          potentialImpact,
          recommendationsJson,
          modelId,
          promptVersion,
          status,
          errorMessage,
          rawResponse,
        ]
      );
    } else {
      await client.query(
        `
        INSERT INTO cve_analysis (
          cve_id, simplified_description, exploitability_level, exploitability_rationale,
          potential_impact, remediation_recommendations, model_id, prompt_version, status, error_message,
          raw_model_response, analyzed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        `,
        [
          cveId,
          simplifiedDescription,
          exploitabilityLevel,
          exploitabilityRationale,
          potentialImpact,
          recommendationsJson,
          modelId,
          promptVersion,
          status,
          errorMessage,
          rawResponse,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
