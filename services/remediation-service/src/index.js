const config = require('./config/config');
const { startScheduler } = require('./scheduler/remediationScheduler');
const { createApp } = require('./app');

function main() {
  // No migration step here either - remediation_action is defined in
  // ingestion-service's Flyway migrations (V4__create_remediation_action_table.sql).
  startScheduler();

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] remediation-service listening on port ${config.port}`);
  });
}

main();
