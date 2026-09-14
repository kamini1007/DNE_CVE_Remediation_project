require('dotenv').config();

// ============================================================
// TEMPORARY DIAGNOSTIC - remove this block once Jira config is confirmed
// working. Prints exactly what dotenv actually parsed for each Jira
// variable - length and a safely-truncated preview, never the full
// token - so hidden whitespace, invisible characters, or genuine absence
// are all distinguishable from each other, instead of guessing from
// eyeballing the file.
// ============================================================
function describe(name, value) {
  if (value === undefined) return `${name}: UNDEFINED (not in process.env at all)`;
  if (value === '') return `${name}: EMPTY STRING (present but blank)`;
  const preview = value.length > 6 ? `${value.slice(0, 3)}...${value.slice(-3)}` : '(too short to preview safely)';
  return `${name}: length=${value.length}, preview="${preview}"`;
}
// eslint-disable-next-line no-console
console.log('[diagnostic] cwd =', process.cwd());
// eslint-disable-next-line no-console
console.log('[diagnostic] ' + describe('JIRA_BASE_URL', process.env.JIRA_BASE_URL));
// eslint-disable-next-line no-console
console.log('[diagnostic] ' + describe('JIRA_EMAIL', process.env.JIRA_EMAIL));
// eslint-disable-next-line no-console
console.log('[diagnostic] ' + describe('JIRA_API_TOKEN', process.env.JIRA_API_TOKEN));
// eslint-disable-next-line no-console
console.log('[diagnostic] ' + describe('JIRA_PROJECT_KEY', process.env.JIRA_PROJECT_KEY));
// ============================================================
// END TEMPORARY DIAGNOSTIC
// ============================================================

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
    `projectKey=${config.jira.projectKey}, issueType=${config.jira.issueType}. Real tickets will be created.`
  );
} else {
  const missing = ['baseUrl', 'email', 'apiToken', 'projectKey'].filter((k) => !config.jira[k]);
  // eslint-disable-next-line no-console
  console.log(
    `[config] Jira is NOT configured - missing: ${missing.join(', ')}. ` +
    'Running in DRY-RUN mode: playbooks will be generated, but no real Jira tickets will be created.'
  );
}

module.exports = config;