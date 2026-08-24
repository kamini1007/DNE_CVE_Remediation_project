const cron = require('node-cron');
const config = require('../config/config');
const { runBatch } = require('../services/analysisService');

function startScheduler() {
  if (!cron.validate(config.analysis.cron)) {
    throw new Error(`Invalid ANALYSIS_CRON expression: ${config.analysis.cron}`);
  }

  cron.schedule(config.analysis.cron, async () => {
    // eslint-disable-next-line no-console
    console.log('[scheduler] triggering scheduled analysis batch');
    try {
      await runBatch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[scheduler] batch run failed unexpectedly:', err);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[scheduler] analysis batch scheduled with cron "${config.analysis.cron}"`);
}

module.exports = { startScheduler };
