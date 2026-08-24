const express = require('express');
const analysisRepository = require('../repository/analysisRepository');
const { analyzeCveById, runBatch } = require('../services/analysisService');
const { toCamelCase, toCamelCaseList } = require('../utils/caseMapper');

const router = express.Router();

// Triggers a batch run async and returns immediately - mirrors the
// ingestion-service's /api/ingestion/trigger pattern for consistency.
router.post('/trigger', (req, res) => {
  const batchSize = req.body?.batchSize;
  runBatch(batchSize).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[analysis] manual trigger failed:', err);
  });
  res.status(202).json({ message: 'Analysis batch triggered' });
});

// Synchronous on-demand analysis for a single CVE (e.g. "analyze this now" from the dashboard).
router.post('/cve/:cveId', async (req, res) => {
  try {
    const result = await analyzeCveById(req.params.cveId);
    res.status(result.status === 'SUCCESS' ? 200 : 502).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/cve/:cveId', async (req, res) => {
  const analysis = await analysisRepository.findByCveId(req.params.cveId);
  if (!analysis) {
    return res.status(404).json({ error: `No analysis found for ${req.params.cveId}` });
  }
  res.json(toCamelCase(analysis));
});

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page || '0', 10);
  const size = Math.min(parseInt(req.query.size || '20', 10), 100);
  const status = req.query.status;
  const results = await analysisRepository.list({ status, page, size });
  res.json(toCamelCaseList(results));
});

module.exports = router;
