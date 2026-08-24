const config = require('../config/config');
const riskScoreRepository = require('../repository/riskScoreRepository');
const remediationRepository = require('../repository/remediationRepository');
const { buildPlaybook } = require('./playbookService');
const { createTicket } = require('./jiraClient');
const { remediationTotal, batchDuration, batchSize: batchSizeGauge } = require('../metrics/metrics');

/**
 * Builds a playbook (and, if Jira is configured, a ticket) for one already-fetched
 * scored CVE. Never throws - failures are recorded as a FAILED row so a bad
 * CVE doesn't stop the rest of a batch, and gets retried on the next run.
 */
async function remediateOne(scoredCve) {
  const cveId = scoredCve.cve_id;

  try {
    const playbook = buildPlaybook(scoredCve);
    const ticket = await createTicket(cveId, playbook);

    const status = ticket.dryRun ? 'PLAYBOOK_GENERATED' : 'TICKET_CREATED';

    await remediationRepository.upsertRemediation({
      cveId,
      riskScoreSnapshot: scoredCve.risk_score,
      riskLevelSnapshot: scoredCve.risk_level,
      playbook,
      jiraTicketKey: ticket.ticketKey,
      jiraTicketUrl: ticket.ticketUrl,
      status,
    });

    remediationTotal.inc({ status });
    return { cveId, status };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[remediation] failed for ${cveId}: ${err.message}`);
    await remediationRepository.upsertRemediation({
      cveId,
      riskScoreSnapshot: scoredCve.risk_score,
      riskLevelSnapshot: scoredCve.risk_level,
      playbook: { summary: 'Playbook generation or ticket creation failed', urgency: scoredCve.risk_level, dueByHours: null, steps: [] },
      status: 'FAILED',
      errorMessage: err.message?.slice(0, 2000),
    });
    remediationTotal.inc({ status: 'FAILED' });
    return { cveId, status: 'FAILED', error: err.message };
  }
}

/** Remediates one CVE by ID on demand, fetching it fresh. Used by the manual API route. */
async function remediateCveById(cveId) {
  const scoredCve = await riskScoreRepository.findScoredCveById(cveId);
  if (!scoredCve) {
    const err = new Error(
      `${cveId} has no risk score and/or successful AI analysis yet - risk-engine-service and ai-analysis-service must process it first`
    );
    err.statusCode = 409;
    throw err;
  }
  return remediateOne(scoredCve);
}

/**
 * Processes up to `batchSize` CVEs at or above the configured minimum risk
 * level that need a (re-)generated remediation action, highest risk first.
 */
async function runBatch(batchSize = config.remediation.batchSize) {
  const stopTimer = batchDuration.startTimer();
  try {
    const candidates = await riskScoreRepository.findCvesNeedingRemediation(config.remediation.minRiskLevel, batchSize);
    batchSizeGauge.set(candidates.length);

    if (candidates.length === 0) {
      return { fetched: 0, succeeded: 0, failed: 0 };
    }

    const results = [];
    for (const cve of candidates) {
      // Sequential, not concurrent: Jira's API has its own rate limits, and
      // ticket creation volume here is inherently low (only HIGH/CRITICAL CVEs).
      results.push(await remediateOne(cve));
    }

    const succeeded = results.filter((r) => r.status !== 'FAILED').length;
    const failed = results.length - succeeded;

    // eslint-disable-next-line no-console
    console.log(`[remediation] batch complete: fetched=${candidates.length} succeeded=${succeeded} failed=${failed}`);
    return { fetched: candidates.length, succeeded, failed };
  } finally {
    stopTimer();
  }
}

module.exports = { remediateOne, remediateCveById, runBatch };
