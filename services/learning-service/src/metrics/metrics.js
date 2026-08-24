const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ application: 'learning-service' });

client.collectDefaultMetrics({ register });

const feedbackTotal = new client.Counter({
  name: 'cve_feedback_total',
  help: 'Total feedback entries submitted, by type',
  labelNames: ['feedback_type'],
  registers: [register],
});

const reportsGeneratedTotal = new client.Counter({
  name: 'cve_calibration_reports_generated_total',
  help: 'Total calibration reports generated',
  registers: [register],
});

module.exports = { register, feedbackTotal, reportsGeneratedTotal };
