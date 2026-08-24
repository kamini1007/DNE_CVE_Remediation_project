const express = require('express');
const cors = require('cors');
const analysisRoutes = require('./routes/analysisRoutes');
const { register } = require('./metrics/metrics');

function createApp() {
  const app = express();

  // Allows the dashboard (localhost:5173, a different origin than this
  // service's localhost:3000) to call this API from the browser. In the real
  // AWS deployment this becomes moot - everything is served from one
  // hostname behind the ALB, so requests are same-origin. This is
  // specifically for local dev, where each service runs on its own port.
  app.use(cors({ origin: process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173' }));

  app.use(express.json());

  // Matches the k8s liveness/readiness probe path in k8s/ai-analysis-service/deployment.yaml.
  app.get('/health', (req, res) => res.json({ status: 'UP' }));

  // Scraped by Prometheus - see k8s/monitoring/servicemonitors.yaml.
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.use('/api/analysis', analysisRoutes);

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
