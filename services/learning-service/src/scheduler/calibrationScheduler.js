const cron = require('node-cron');
const config = require('../config/config');
const { generateReport } = require('../services/calibrationService');
const { reportsGeneratedTotal } = require('../metrics/metrics');

function startScheduler() {
  if (!cron.validate(config.calibration.cron)) {
    throw new Error(`Invalid CALIBRATION_CRON expression: ${config.calibration.cron}`);
  }

  cron.schedule(config.calibration.cron, async () => {
    // eslint-disable-next-line no-console
    console.log('[scheduler] generating scheduled calibration report');
    try {
      await generateReport();
      reportsGeneratedTotal.inc();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[scheduler] calibration report generation failed:', err);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[scheduler] calibration report scheduled with cron "${config.calibration.cron}"`);
}

module.exports = { startScheduler };
