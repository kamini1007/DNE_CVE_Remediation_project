const express = require('express');
const feedbackRepository = require('../repository/feedbackRepository');
const { feedbackTotal } = require('../metrics/metrics');
const { toCamelCase, toCamelCaseList } = require('../utils/caseMapper');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { cveId, feedbackType, rating, comment, submittedBy } = req.body || {};
    const created = await feedbackRepository.submitFeedback({ cveId, feedbackType, rating, comment, submittedBy });
    feedbackTotal.inc({ feedback_type: feedbackType });
    res.status(201).json(toCamelCase(created));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/cve/:cveId', async (req, res) => {
  const results = await feedbackRepository.findByCveId(req.params.cveId);
  res.json(toCamelCaseList(results));
});

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page || '0', 10);
  const size = Math.min(parseInt(req.query.size || '20', 10), 100);
  const feedbackType = req.query.type;
  const results = await feedbackRepository.list({ feedbackType, page, size });
  res.json(toCamelCaseList(results));
});

module.exports = router;
