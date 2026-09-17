const pool = require('../db/pool');

const RISK_LEVEL_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Fetch one CVE + its risk score + its AI analysis, joined - everything a playbook needs. */
async function findScoredCveById(cveId) {
  const { rows } = await pool.query(
    `
    SELECT
      c.cve_id, c.vendor, c.product, c.cvss_v3_score,
      r.risk_score, r.risk_level, r.computed_at AS risk_computed_at,
      a.exploitability_level, a.potential_impact, a.remediation_recommendations
    FROM cve c
    JOIN risk_score r ON r.cve_id = c.cve_id
    JOIN cve_analysis a ON a.cve_id = c.cve_id AND a.status = 'SUCCESS'
    WHERE c.cve_id = $1
    `,
    [cveId]
  );
  return rows[0] || null;
}

/**
 * Finds risk-scored, successfully-analyzed CVEs at or above `minRiskLevel`
 * that don't have a remediation action yet, or whose risk score has changed
 * since their last remediation action was generated (re-prioritized CVEs get
 * a fresh playbook/urgency). Highest risk score first.
 *
 * SAFETY CONDITION ADDED: once a CVE has a real Jira ticket
 * (jira_ticket_key IS NOT NULL), it is NEVER reconsidered here again, even
 * if it gets re-scored later. Without this, a CVE ticketed as part of a
 * project-level batch ticket (see ingestion-service's JiraTicketService)
 * could get re-scored by risk-engine-service sometime after that batch
 * ticket was created, making the old `r.computed_at > m.updated_at`
 * condition true again - which would cause this scheduler to create a
 * SECOND, individual Jira ticket for a CVE that's already covered by a
 * project ticket. This condition closes that gap: a re-score can still
 * refresh a FAILED or ticket-less remediation_action row, but never one
 * that already points at a real, created ticket.
 */
async function findCvesNeedingRemediation(minRiskLevel, limit) {
  const minRank = RISK_LEVEL_RANK[minRiskLevel] || RISK_LEVEL_RANK.HIGH;
  const eligibleLevels = Object.entries(RISK_LEVEL_RANK)
    .filter(([, rank]) => rank >= minRank)
    .map(([level]) => level);

  const { rows } = await pool.query(
    `
    SELECT
      c.cve_id, c.vendor, c.product, c.cvss_v3_score,
      r.risk_score, r.risk_level, r.computed_at AS risk_computed_at,
      a.exploitability_level, a.potential_impact, a.remediation_recommendations
    FROM cve c
    JOIN risk_score r ON r.cve_id = c.cve_id
    JOIN cve_analysis a ON a.cve_id = c.cve_id AND a.status = 'SUCCESS'
    LEFT JOIN remediation_action m ON m.cve_id = c.cve_id
    WHERE r.risk_level = ANY($1)
      AND (
        m.cve_id IS NULL
        OR (m.jira_ticket_key IS NULL AND (r.computed_at > m.updated_at OR m.status = 'FAILED'))
      )
    ORDER BY r.risk_score DESC
    LIMIT $2
    `,
    [eligibleLevels, limit]
  );
  return rows;
}

module.exports = { findScoredCveById, findCvesNeedingRemediation };
