const express = require('express');
const cors = require('cors');
const remediationRoutes = require('./routes/remediationRoutes');
const { register } = require('./metrics/metrics');

function createApp() {
  const app = express();

  // See ai-analysis-service/src/app.js for the full explanation - same
  // reasoning applies here.
  app.use(cors({ origin: process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173' }));

  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'UP' }));

  // Scraped by Prometheus - see k8s/monitoring/servicemonitors.yaml.
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.use('/api/remediation', remediationRoutes);

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
