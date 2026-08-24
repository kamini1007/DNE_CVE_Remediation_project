const pool = require('../db/pool');

const VALID_TYPES = new Set(['ANALYSIS_ACCURACY', 'RISK_ACCURACY', 'REMEDIATION_OUTCOME']);

async function submitFeedback({ cveId, feedbackType, rating, comment, submittedBy }) {
  if (!VALID_TYPES.has(feedbackType)) {
    const err = new Error(`feedbackType must be one of ${[...VALID_TYPES].join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const err = new Error('rating must be an integer between 1 and 5');
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await pool.query(
    `
    INSERT INTO feedback (cve_id, feedback_type, rating, comment, submitted_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, cve_id, feedback_type, rating, comment, submitted_by, created_at
    `,
    [cveId, feedbackType, rating, comment || null, submittedBy || null]
  );
  return rows[0];
}

async function findByCveId(cveId) {
  const { rows } = await pool.query('SELECT * FROM feedback WHERE cve_id = $1 ORDER BY created_at DESC', [cveId]);
  return rows;
}

async function list({ feedbackType, page = 0, size = 20 }) {
  const params = [];
  let where = '';
  if (feedbackType) {
    params.push(feedbackType);
    where = `WHERE feedback_type = $${params.length}`;
  }
  params.push(size, page * size);

  const { rows } = await pool.query(
    `SELECT * FROM feedback ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = { submitFeedback, findByCveId, list, VALID_TYPES };
