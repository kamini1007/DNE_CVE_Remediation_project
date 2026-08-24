const express = require('express');
const remediationRepository = require('../repository/remediationRepository');
const { remediateCveById, runBatch } = require('../services/remediationService');
const { pollOutcomes } = require('../services/outcomeTrackingService');
const { toCamelCase, toCamelCaseList } = require('../utils/caseMapper');

const router = express.Router();

router.post('/outcomes/poll', (req, res) => {
  pollOutcomes().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[remediation] manual outcome poll failed:', err);
  });
  res.status(202).json({ message: 'Outcome poll triggered' });
});

router.post('/trigger', (req, res) => {
  const batchSize = req.body?.batchSize;
  runBatch(batchSize).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[remediation] manual trigger failed:', err);
  });
  res.status(202).json({ message: 'Remediation batch triggered' });
});

router.post('/cve/:cveId', async (req, res) => {
  try {
    const result = await remediateCveById(req.params.cveId);
    res.status(result.status === 'FAILED' ? 502 : 200).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/cve/:cveId', async (req, res) => {
  const remediation = await remediationRepository.findByCveId(req.params.cveId);
  if (!remediation) {
    return res.status(404).json({ error: `No remediation action found for ${req.params.cveId}` });
  }
  res.json(toCamelCase(remediation));
});

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page || '0', 10);
  const size = Math.min(parseInt(req.query.size || '20', 10), 100);
  const status = req.query.status;
  const results = await remediationRepository.list({ status, page, size });
  res.json(toCamelCaseList(results));
});

module.exports = router;
