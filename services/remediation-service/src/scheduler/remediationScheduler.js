const cron = require('node-cron');
const config = require('../config/config');
const { runBatch } = require('../services/remediationService');
const { pollOutcomes } = require('../services/outcomeTrackingService');

function startScheduler() {
  if (!cron.validate(config.remediation.cron)) {
    throw new Error(`Invalid REMEDIATION_CRON expression: ${config.remediation.cron}`);
  }
  if (config.outcomeTracking.enabled && !cron.validate(config.outcomeTracking.cron)) {
    throw new Error(`Invalid OUTCOME_TRACKING_CRON expression: ${config.outcomeTracking.cron}`);
  }

  cron.schedule(config.remediation.cron, async () => {
    // eslint-disable-next-line no-console
    console.log('[scheduler] triggering scheduled remediation batch');
    try {
      await runBatch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[scheduler] batch run failed unexpectedly:', err);
    }
  });

  if (config.outcomeTracking.enabled) {
    cron.schedule(config.outcomeTracking.cron, async () => {
      // eslint-disable-next-line no-console
      console.log('[scheduler] triggering scheduled Jira outcome poll');
      try {
        await pollOutcomes();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[scheduler] outcome poll failed unexpectedly:', err);
      }
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[scheduler] remediation batch scheduled with cron "${config.remediation.cron}" ` +
    `(min risk level: ${config.remediation.minRiskLevel}, Jira ${config.jira.isConfigured ? 'configured' : 'NOT configured - dry-run mode'}); ` +
    `outcome tracking ${config.outcomeTracking.enabled ? `scheduled with cron "${config.outcomeTracking.cron}"` : 'disabled'}`
  );
}

module.exports = { startScheduler };
