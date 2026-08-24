require('dotenv').config();

function parseList(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'cve_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  bedrock: {
    region: process.env.AWS_REGION || 'us-east-1',
    // Tried first; each fallback is tried in order if the previous one is
    // throttled/unavailable (see bedrockClient.js).
    primaryModelId: process.env.BEDROCK_PRIMARY_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    fallbackModelIds: parseList(process.env.BEDROCK_FALLBACK_MODEL_IDS || 'anthropic.claude-3-haiku-20240307-v1:0'),
    maxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '1500', 10),
    // Optional override so the AWS SDK client points at a local endpoint
    // (LocalStack, or the mock-bedrock service under infra/localstack/)
    // instead of real AWS Bedrock. Unset in production/real EKS.
    endpointUrl: process.env.BEDROCK_ENDPOINT_URL || null,
  },

  analysis: {
    cron: process.env.ANALYSIS_CRON || '*/15 * * * *',
    batchSize: parseInt(process.env.ANALYSIS_BATCH_SIZE || '25', 10),
    concurrency: parseInt(process.env.ANALYSIS_CONCURRENCY || '3', 10),
  },
};

module.exports = config;
