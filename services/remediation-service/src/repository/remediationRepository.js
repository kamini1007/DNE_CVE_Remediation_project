const pool = require('../db/pool');

/**
 * PORTABLE REWRITE: previously used `ON CONFLICT (cve_id) DO UPDATE`, which
 * H2 doesn't support. Same check-then-insert-or-update pattern as
 * analysisRepository.js - see that file for the fuller explanation.
 */
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
  const playbookJson = JSON.stringify(playbook);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query('SELECT cve_id FROM remediation_action WHERE cve_id = $1', [cveId]);

    if (existing.length > 0) {
      await client.query(
        `
        UPDATE remediation_action SET
          risk_score_snapshot = $2,
          risk_level_snapshot = $3,
          playbook             = $4,
          jira_ticket_key      = $5,
          jira_ticket_url      = $6,
          status                = $7,
          error_message         = $8,
          updated_at            = now()
        WHERE cve_id = $1
        `,
        [cveId, riskScoreSnapshot, riskLevelSnapshot, playbookJson, jiraTicketKey, jiraTicketUrl, status, errorMessage]
      );
    } else {
      await client.query(
        `
        INSERT INTO remediation_action (
          cve_id, risk_score_snapshot, risk_level_snapshot, playbook,
          jira_ticket_key, jira_ticket_url, status, error_message, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        `,
        [cveId, riskScoreSnapshot, riskLevelSnapshot, playbookJson, jiraTicketKey, jiraTicketUrl, status, errorMessage]
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
 *
 * PORTABLE REWRITE: previously computed this with PostgreSQL-specific
 * `EXTRACT(EPOCH FROM ...)` date arithmetic and a `::numeric` cast inside
 * the UPDATE itself. Both are avoided now by fetching created_at first and
 * doing the hours-to-resolution and met_sla calculation in plain
 * JavaScript, then writing the already-computed values - portable
 * regardless of which database is behind pool.query().
 */
async function markResolved(cveId, resolvedAt, dueByHours) {
  const { rows } = await pool.query('SELECT created_at FROM remediation_action WHERE cve_id = $1', [cveId]);
  if (rows.length === 0) {
    return;
  }

  const createdAt = new Date(rows[0].created_at);
  const resolvedDate = new Date(resolvedAt);
  const hoursToResolution = Math.round(((resolvedDate.getTime() - createdAt.getTime()) / 1000 / 3600) * 100) / 100;
  const metSla = dueByHours == null ? null : hoursToResolution <= Number(dueByHours);

  await pool.query(
    `
    UPDATE remediation_action
    SET resolved_at = $2,
        time_to_resolution_hours = $3,
        met_sla = $4,
        status = 'RESOLVED',
        updated_at = now()
    WHERE cve_id = $1
    `,
    [cveId, resolvedAt, hoursToResolution, metSla]
  );
}

module.exports = { upsertRemediation, findByCveId, list, findTicketsAwaitingOutcome, markResolved };
