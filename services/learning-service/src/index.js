const config = require('./config/config');
const { startScheduler } = require('./scheduler/calibrationScheduler');
const { createApp } = require('./app');

function main() {
  // No migration step here either - feedback, remediation_action's outcome
  // columns, and calibration_report are all defined in ingestion-service's
  // Flyway migrations (V5__continuous_learning.sql).
  startScheduler();

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] learning-service listening on port ${config.port}`);
  });
}

main();
