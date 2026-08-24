const express = require('express');
const calibrationRepository = require('../repository/calibrationRepository');
const { generateReport } = require('../services/calibrationService');
const { toCamelCase, toCamelCaseList } = require('../utils/caseMapper');

const router = express.Router();

router.post('/trigger', (req, res) => {
  generateReport().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[learning] manual report generation failed:', err);
  });
  res.status(202).json({ message: 'Calibration report generation triggered' });
});

router.get('/latest', async (req, res) => {
  const report = await calibrationRepository.getLatestReport();
  if (!report) {
    return res.status(404).json({ error: 'No calibration report has been generated yet' });
  }
  res.json(toCamelCase(report));
});

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const reports = await calibrationRepository.listReports(limit);
  res.json(toCamelCaseList(reports));
});

module.exports = router;
