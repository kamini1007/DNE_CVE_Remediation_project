require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3002', 10),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'cve_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  calibration: {
    cron: process.env.CALIBRATION_CRON || '0 0 3 * * *', // daily at 03:00
    // Below this many data points, a stat is shown but never turned into a
    // recommendation - a handful of noisy responses shouldn't drive a
    // suggested change to production risk weights or the AI prompt.
    minSampleSize: parseInt(process.env.CALIBRATION_MIN_SAMPLE_SIZE || '5', 10),
    // Below this average (out of 5), flag for review.
    ratingThreshold: parseFloat(process.env.CALIBRATION_RATING_THRESHOLD || '3.0'),
    // Below this fraction of tickets meeting their playbook's own SLA, flag for review.
    slaThreshold: parseFloat(process.env.CALIBRATION_SLA_THRESHOLD || '0.7'),
  },
};

module.exports = config;
