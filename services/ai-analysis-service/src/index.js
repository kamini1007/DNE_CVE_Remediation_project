const config = require('./config/config');
const { startScheduler } = require('./scheduler/analysisScheduler');
const { createApp } = require('./app');

function main() {
  // No migration step here on purpose: cve_analysis is defined in
  // ingestion-service's Flyway migrations (V2__create_cve_analysis_table.sql),
  // which is the single schema authority for this database. Running
  // ingestion-service at least once before this service is a deployment
  // prerequisite, noted in the README.
  startScheduler();

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] ai-analysis-service listening on port ${config.port}`);
  });
}

main();
