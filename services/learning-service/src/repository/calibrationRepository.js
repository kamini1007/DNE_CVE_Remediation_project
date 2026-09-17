const pool = require('../db/pool');

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Per risk level: how analysts rated the risk score's accuracy (feedback),
 * and what actually happened operationally (remediation outcomes). Two
 * separate queries rather than one join, since feedback and remediation
 * outcomes are independent signals with different sample sizes - joining
 * them would silently drop rows wherever one side is missing.
 *
 * PORTABLE REWRITE: `::int` and `::numeric` are PostgreSQL's shorthand cast
 * syntax - replaced with standard CAST(... AS type), which works
 * identically on every database rather than relying on shorthand that
 * isn't confirmed to work the same way everywhere.
 */
async function getRiskLevelStats() {
  const { rows: feedbackRows } = await pool.query(
    `
    SELECT r.risk_level,
           CAST(COUNT(*) AS INTEGER) AS feedback_count,
           ROUND(CAST(AVG(f.rating) AS NUMERIC), 2) AS avg_rating
    FROM feedback f
    JOIN risk_score r ON r.cve_id = f.cve_id
    WHERE f.feedback_type = 'RISK_ACCURACY'
    GROUP BY r.risk_level
    `
  );

  const { rows: outcomeRows } = await pool.query(
    `
    SELECT risk_level_snapshot AS risk_level,
           CAST(COUNT(*) AS INTEGER) AS resolved_count,
           ROUND(CAST(AVG(CAST(met_sla AS INTEGER)) AS NUMERIC), 2) AS sla_met_rate
    FROM remediation_action
    WHERE resolved_at IS NOT NULL AND met_sla IS NOT NULL
    GROUP BY risk_level_snapshot
    `
  );

  const feedbackByLevel = Object.fromEntries(feedbackRows.map((r) => [r.risk_level, r]));
  const outcomeByLevel = Object.fromEntries(outcomeRows.map((r) => [r.risk_level, r]));

  return RISK_LEVELS.map((level) => ({
    level,
    feedbackCount: feedbackByLevel[level]?.feedback_count ?? 0,
    avgRating: feedbackByLevel[level]?.avg_rating !== undefined ? Number(feedbackByLevel[level].avg_rating) : null,
    resolvedCount: outcomeByLevel[level]?.resolved_count ?? 0,
    slaMetRate: outcomeByLevel[level]?.sla_met_rate !== undefined ? Number(outcomeByLevel[level].sla_met_rate) : null,
  }));
}

/** Per prompt version: how analysts rated the AI analysis it produced. */
async function getPromptVersionStats() {
  const { rows } = await pool.query(
    `
    SELECT a.prompt_version,
           CAST(COUNT(*) AS INTEGER) AS feedback_count,
           ROUND(CAST(AVG(f.rating) AS NUMERIC), 2) AS avg_rating
    FROM feedback f
    JOIN cve_analysis a ON a.cve_id = f.cve_id
    WHERE f.feedback_type = 'ANALYSIS_ACCURACY' AND a.prompt_version IS NOT NULL
    GROUP BY a.prompt_version
    ORDER BY a.prompt_version
    `
  );

  return rows.map((r) => ({
    promptVersion: r.prompt_version,
    feedbackCount: r.feedback_count,
    avgRating: Number(r.avg_rating),
  }));
}

/**
 * PORTABLE REWRITE: previously used `RETURNING id, generated_at, ...` -
 * not supported by H2. Same explicit-timestamp-then-lookup pattern as
 * feedbackRepository.submitFeedback().
 */
async function saveReport({ riskLevelStats, promptVersionStats, recommendations }) {
  const generatedAt = new Date();
  const riskLevelStatsJson = JSON.stringify(riskLevelStats);
  const promptVersionStatsJson = JSON.stringify(promptVersionStats);
  const recommendationsJson = JSON.stringify(recommendations);

  await pool.query(
    `
    INSERT INTO calibration_report (risk_level_stats, prompt_version_stats, recommendations, generated_at)
    VALUES ($1, $2, $3, $4)
    `,
    [riskLevelStatsJson, promptVersionStatsJson, recommendationsJson, generatedAt]
  );

  const { rows } = await pool.query(
    `
    SELECT id FROM calibration_report
    WHERE generated_at = $1
    ORDER BY id DESC LIMIT 1
    `,
    [generatedAt]
  );

  return {
    id: rows[0]?.id ?? null,
    generated_at: generatedAt,
    risk_level_stats: riskLevelStats,
    prompt_version_stats: promptVersionStats,
    recommendations,
  };
}

async function getLatestReport() {
  const { rows } = await pool.query('SELECT * FROM calibration_report ORDER BY generated_at DESC LIMIT 1');
  return rows[0] || null;
}

async function listReports(limit = 20) {
  const { rows } = await pool.query('SELECT * FROM calibration_report ORDER BY generated_at DESC LIMIT $1', [limit]);
  return rows;
}

module.exports = { getRiskLevelStats, getPromptVersionStats, saveReport, getLatestReport, listReports };
