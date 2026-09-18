require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'cve_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  jira: {
    baseUrl: process.env.JIRA_BASE_URL || null,
    email: process.env.JIRA_EMAIL || null,
    apiToken: process.env.JIRA_API_TOKEN || null,
    projectKey: process.env.JIRA_PROJECT_KEY || null,
    issueType: process.env.JIRA_ISSUE_TYPE || 'Task',
  },

  remediation: {
    cron: process.env.REMEDIATION_CRON || '0 0 */2 * * *', // every 2 hours on the hour
    batchSize: parseInt(process.env.REMEDIATION_BATCH_SIZE || '50', 10),
    // Only risk levels at or above this get a remediation action - LOW/MEDIUM
    // CVEs aren't worth a Jira ticket by default in most vuln management programs.
    minRiskLevel: process.env.REMEDIATION_MIN_RISK_LEVEL || 'HIGH',
    // CHANGED: defaults to false now. This scheduled job runs against the
    // GENERAL risk-scored CVE population (anything from NVD/MITRE/vendor
    // ingestion, completely unrelated to project scanning) - previously it
    // created a real Jira ticket for every HIGH/CRITICAL CVE it found here,
    // which meant new tickets kept appearing just from routine daily
    // ingestion, with no scan involved at all. Now it still generates and
    // stores a playbook (so "Playbooks Ready" and the remediation_action
    // history stay meaningful), but never creates a real ticket unless this
    // is explicitly set to true. Real tickets now only ever come from
    // ingestion-service's scan-triggered JiraTicketService (one ticket per
    // scan), which is unaffected by this flag entirely - that's a separate
    // service with its own, always-on ticket creation.
    autoCreateTickets: process.env.REMEDIATION_AUTO_CREATE_TICKETS === 'true',
  },

  outcomeTracking: {
    // Polls Jira for tickets that moved to a resolved status, so remediation
    // outcomes (met SLA or not) feed Phase 8's calibration reports. A real
    // Jira webhook would be lower-latency, but requires a public endpoint;
    // polling is the simpler, self-contained choice at this scale.
    enabled: process.env.OUTCOME_TRACKING_ENABLED !== 'false',
    cron: process.env.OUTCOME_TRACKING_CRON || '0 30 */4 * * *', // every 4 hours at :30
    resolvedStatuses: (process.env.JIRA_RESOLVED_STATUSES || 'Done,Resolved,Closed')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },
};

/** Jira integration is optional - if any piece is missing, run in dry-run mode (playbook only, no real ticket). */
config.jira.isConfigured = Boolean(
  config.jira.baseUrl && config.jira.email && config.jira.apiToken && config.jira.projectKey
);

if (config.jira.isConfigured) {
  // eslint-disable-next-line no-console
  console.log(
    `[config] Jira IS configured - baseUrl=${config.jira.baseUrl}, email=${config.jira.email}, ` +
    `projectKey=${config.jira.projectKey}, issueType=${config.jira.issueType}.`
  );
} else {
  const missing = ['baseUrl', 'email', 'apiToken', 'projectKey'].filter((k) => !config.jira[k]);
  // eslint-disable-next-line no-console
  console.log(`[config] Jira is NOT configured - missing: ${missing.join(', ')}.`);
}

// eslint-disable-next-line no-console
console.log(
  config.remediation.autoCreateTickets
    ? '[config] REMEDIATION_AUTO_CREATE_TICKETS=true - this service\'s own scheduled job WILL create real Jira tickets for the general risk-scored CVE population.'
    : '[config] REMEDIATION_AUTO_CREATE_TICKETS is not set to true - this service\'s scheduled job will only generate playbooks (dry-run), never a real ticket. Real tickets now only come from ingestion-service\'s scan-triggered flow.'
);

module.exports = config;
