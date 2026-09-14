const pool = require('../db/pool');

const VALID_TYPES = new Set(['ANALYSIS_ACCURACY', 'RISK_ACCURACY', 'REMEDIATION_OUTCOME']);

/**
 * PORTABLE REWRITE: previously used `RETURNING id, ...` to hand back the
 * created row - confirmed H2 doesn't support RETURNING at all, even in
 * PostgreSQL compatibility mode. Fixed by explicitly setting created_at
 * from JavaScript (rather than leaving it to a database-side default) and
 * then querying for the generated id using that exact timestamp - both are
 * standard INSERT/SELECT, portable regardless of database.
 */
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

  const createdAt = new Date();
  const normalizedComment = comment || null;
  const normalizedSubmittedBy = submittedBy || null;

  await pool.query(
    `
    INSERT INTO feedback (cve_id, feedback_type, rating, comment, submitted_by, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [cveId, feedbackType, rating, normalizedComment, normalizedSubmittedBy, createdAt]
  );

  const { rows } = await pool.query(
    `
    SELECT id FROM feedback
    WHERE cve_id = $1 AND feedback_type = $2 AND created_at = $3
    ORDER BY id DESC LIMIT 1
    `,
    [cveId, feedbackType, createdAt]
  );

  return {
    id: rows[0]?.id ?? null,
    cve_id: cveId,
    feedback_type: feedbackType,
    rating,
    comment: normalizedComment,
    submitted_by: normalizedSubmittedBy,
    created_at: createdAt,
  };
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
