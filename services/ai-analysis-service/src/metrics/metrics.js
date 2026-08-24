const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ application: 'ai-analysis-service' });

// Node process/GC/heap metrics - the baseline every service should expose.
client.collectDefaultMetrics({ register });

/**
 * Domain metrics. Default process metrics alone can't answer the questions
 * that actually matter for this service ("are Bedrock calls failing?", "is
 * the batch keeping up?"), so these track the pipeline itself.
 */
const analysisTotal = new client.Counter({
  name: 'cve_analysis_total',
  help: 'Total CVE analyses attempted, by outcome',
  labelNames: ['status'], // SUCCESS / FAILED
  registers: [register],
});

const bedrockInvocationTotal = new client.Counter({
  name: 'cve_analysis_bedrock_invocations_total',
  help: 'Bedrock InvokeModel calls, by model and outcome',
  labelNames: ['model_id', 'outcome'], // outcome: success / error
  registers: [register],
});

const bedrockDuration = new client.Histogram({
  name: 'cve_analysis_bedrock_duration_seconds',
  help: 'Bedrock InvokeModel round-trip latency',
  labelNames: ['model_id'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [register],
});

const batchDuration = new client.Histogram({
  name: 'cve_analysis_batch_duration_seconds',
  help: 'Duration of a full analysis batch run',
  buckets: [1, 5, 15, 30, 60, 120, 300],
  registers: [register],
});

const batchSize = new client.Gauge({
  name: 'cve_analysis_batch_last_size',
  help: 'Number of CVEs fetched in the most recent batch run',
  registers: [register],
});

module.exports = {
  register,
  analysisTotal,
  bedrockInvocationTotal,
  bedrockDuration,
  batchDuration,
  batchSize,
};
