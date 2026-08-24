const pool = require('../db/pool');

async function upsertRemediation({
  cveId,
  riskScoreSnapshot,
  riskLevelSnapshot,
  playbook,
  jiraTicketKey = null,
  jiraTicketUrl = null,
  status,
  errorMessage = null,
}) {
  await pool.query(
    `
    INSERT INTO remediation_action (
      cve_id, risk_score_snapshot, risk_level_snapshot, playbook,
      jira_ticket_key, jira_ticket_url, status, error_message, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (cve_id) DO UPDATE SET
      risk_score_snapshot = EXCLUDED.risk_score_snapshot,
      risk_level_snapshot = EXCLUDED.risk_level_snapshot,
      playbook             = EXCLUDED.playbook,
      jira_ticket_key      = EXCLUDED.jira_ticket_key,
      jira_ticket_url      = EXCLUDED.jira_ticket_url,
      status                = EXCLUDED.status,
      error_message         = EXCLUDED.error_message,
      updated_at            = now()
    `,
    [
      cveId,
      riskScoreSnapshot,
      riskLevelSnapshot,
      JSON.stringify(playbook),
      jiraTicketKey,
      jiraTicketUrl,
      status,
      errorMessage,
    ]
  );
}

async function findByCveId(cveId) {
  const { rows } = await pool.query('SELECT * FROM remediation_action WHERE cve_id = $1', [cveId]);
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
    `SELECT * FROM remediation_action ${where} ORDER BY updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/** Tickets that were created and haven't been marked resolved yet - candidates for outcome polling. */
async function findTicketsAwaitingOutcome(limit) {
  const { rows } = await pool.query(
    `
    SELECT cve_id, jira_ticket_key, created_at, playbook
    FROM remediation_action
    WHERE status = 'TICKET_CREATED' AND jira_ticket_key IS NOT NULL AND resolved_at IS NULL
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

/**
 * Records that a ticket was resolved: computes hours-to-resolution against
 * the row's own created_at, and whether that beat the playbook's own
 * dueByHours - the ground truth Phase 8's calibration reports read.
 */
async function markResolved(cveId, resolvedAt, dueByHours) {
  await pool.query(
    `
    UPDATE remediation_action
    SET resolved_at = $2,
        time_to_resolution_hours = ROUND(EXTRACT(EPOCH FROM ($2 - created_at)) / 3600.0, 2),
        met_sla = CASE
          WHEN $3::numeric IS NULL THEN NULL
          ELSE (EXTRACT(EPOCH FROM ($2 - created_at)) / 3600.0) <= $3::numeric
        END,
        status = 'RESOLVED',
        updated_at = now()
    WHERE cve_id = $1
    `,
    [cveId, resolvedAt, dueByHours]
  );
}

module.exports = { upsertRemediation, findByCveId, list, findTicketsAwaitingOutcome, markResolved };
