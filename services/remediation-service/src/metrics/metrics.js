const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ application: 'remediation-service' });

client.collectDefaultMetrics({ register });

const remediationTotal = new client.Counter({
  name: 'cve_remediation_total',
  help: 'Total remediation actions generated, by outcome status',
  labelNames: ['status'], // TICKET_CREATED / PLAYBOOK_GENERATED / FAILED
  registers: [register],
});

/**
 * Jira failures are worth their own metric rather than being folded into the
 * generic failure counter: a broken Jira integration (expired token, changed
 * project key) is an operationally distinct problem from a playbook that
 * couldn't be built, and warrants a different alert and a different fix.
 */
const jiraRequestTotal = new client.Counter({
  name: 'cve_remediation_jira_requests_total',
  help: 'Jira API ticket-creation attempts, by outcome',
  labelNames: ['outcome'], // success / error / skipped_dry_run
  registers: [register],
});

const batchDuration = new client.Histogram({
  name: 'cve_remediation_batch_duration_seconds',
  help: 'Duration of a full remediation batch run',
  buckets: [1, 5, 15, 30, 60, 120, 300],
  registers: [register],
});

const batchSize = new client.Gauge({
  name: 'cve_remediation_batch_last_size',
  help: 'Number of CVEs fetched in the most recent remediation batch run',
  registers: [register],
});

module.exports = {
  register,
  remediationTotal,
  jiraRequestTotal,
  batchDuration,
  batchSize,
};
