const config = require('../config/config');
const remediationRepository = require('../repository/remediationRepository');
const { getIssueStatus } = require('./jiraClient');

/**
 * Polls Jira for every open ticket's current status. A status matching the
 * configured resolved-statuses list (default: Done/Resolved/Closed, case-
 * insensitive) gets recorded as ground truth - resolution time, and whether
 * it beat the playbook's own SLA window. This is the data Phase 8's
 * calibration reports are built on.
 */
async function pollOutcomes(limit = 100) {
  if (!config.jira.isConfigured) {
    return { checked: 0, resolved: 0, skipped: 'jira_not_configured' };
  }

  const candidates = await remediationRepository.findTicketsAwaitingOutcome(limit);
  let resolvedCount = 0;

  for (const row of candidates) {
    try {
      const statusName = await getIssueStatus(row.jira_ticket_key);
      if (statusName && config.outcomeTracking.resolvedStatuses.includes(statusName.toLowerCase())) {
        const dueByHours = row.playbook?.dueByHours ?? null;
        await remediationRepository.markResolved(row.cve_id, new Date(), dueByHours);
        resolvedCount++;
      }
    } catch (err) {
      // A single ticket lookup failing (deleted issue, transient Jira error)
      // shouldn't stop the rest of the poll.
      // eslint-disable-next-line no-console
      console.error(`[outcome-tracking] failed to poll ${row.jira_ticket_key} (${row.cve_id}): ${err.message}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[outcome-tracking] checked=${candidates.length} resolved=${resolvedCount}`);
  return { checked: candidates.length, resolved: resolvedCount };
}

module.exports = { pollOutcomes };
