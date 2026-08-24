const pool = require('../db/pool');

/** Fetch a single CVE by ID - used by the on-demand /api/analysis/cve/:cveId route. */
async function findByCveId(cveId) {
  const { rows } = await pool.query('SELECT * FROM cve WHERE cve_id = $1', [cveId]);
  return rows[0] || null;
}

/**
 * Finds CVEs that need (re-)analysis:
 *  - never analyzed (no cve_analysis row), OR
 *  - the CVE's last_modified_date is newer than its last analyzed_at, OR
 *  - the previous analysis attempt FAILED (so it gets retried automatically).
 * Ordered by CVSS v3 score descending (nulls last) so the highest-severity
 * CVEs get analyzed first when Bedrock throughput is limited.
 */
async function findCvesNeedingAnalysis(limit) {
  const { rows } = await pool.query(
    `
    SELECT c.*
    FROM cve c
    LEFT JOIN cve_analysis a ON a.cve_id = c.cve_id
    WHERE a.cve_id IS NULL
       OR a.status = 'FAILED'
       OR c.last_modified_date > a.analyzed_at
    ORDER BY c.cvss_v3_score DESC NULLS LAST, c.last_modified_date DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

module.exports = { findByCveId, findCvesNeedingAnalysis };
