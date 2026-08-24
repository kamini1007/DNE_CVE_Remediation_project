const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const config = require('../config/config');
const { bedrockInvocationTotal, bedrockDuration } = require('../metrics/metrics');

// Credentials come from the default AWS SDK chain, which on EKS resolves to
// the pod's IRSA role (see k8s/ai-analysis-service/serviceaccount.yaml and
// infra/terraform/iam-bedrock.tf) - no keys are configured here on purpose.
//
// For local/LocalStack testing, BEDROCK_ENDPOINT_URL redirects this client at
// a local endpoint instead (see infra/localstack/README.md). Local endpoints
// don't validate real AWS credentials, so dummy values keep the SDK's
// request-signing step happy without needing real AWS access.
const clientConfig = { region: config.bedrock.region };
if (config.bedrock.endpointUrl) {
  clientConfig.endpoint = config.bedrock.endpointUrl;
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  };
  // @aws-sdk/client-bedrock-runtime defaults to an HTTP/2 request handler
  // (added for real Bedrock's streaming support). mock-bedrock is a plain
  // Express server - HTTP/1.1 only - so an HTTP/2 handshake against it fails
  // with a generic "Protocol error" (Node's ERR_HTTP2_ERROR under the hood).
  // Forcing HTTP/1.1 here fixes that. Deliberately scoped to only the local
  // mock case - real AWS Bedrock supports HTTP/2 fine, and forcing HTTP/1.1
  // there would just throw away a real SDK performance improvement.
  clientConfig.requestHandler = new NodeHttpHandler();
}
const client = new BedrockRuntimeClient(clientConfig);

const RETRYABLE_ERROR_NAMES = new Set(['ThrottlingException', 'ServiceUnavailableException', 'ModelTimeoutException']);

/**
 * Invokes the primary model, falling back through config.bedrock.fallbackModelIds
 * in order if the primary is throttled/unavailable. Throws if every model fails,
 * or immediately for a non-retryable error (e.g. a validation error, which
 * would just fail identically on every fallback model too).
 */
async function invokeWithFallback(systemPrompt, userPrompt) {
  const modelIds = [config.bedrock.primaryModelId, ...config.bedrock.fallbackModelIds];
  let lastError;

  for (const modelId of modelIds) {
    try {
      const text = await invokeModel(modelId, systemPrompt, userPrompt);
      return { modelId, text };
    } catch (err) {
      lastError = err;
      const retryable = RETRYABLE_ERROR_NAMES.has(err.name);
      // eslint-disable-next-line no-console
      console.warn(`[bedrock] model ${modelId} failed (${err.name}): ${err.message}${retryable ? ' - trying next model' : ''}`);
      if (!retryable) {
        throw err;
      }
    }
  }

  throw lastError;
}

async function invokeModel(modelId, systemPrompt, userPrompt) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: config.bedrock.maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2, // analytical task, not creative writing - keep it consistent
  });

  const command = new InvokeModelCommand({
    modelId,
    body,
    contentType: 'application/json',
    accept: 'application/json',
  });

  const stopTimer = bedrockDuration.startTimer({ model_id: modelId });
  let response;
  try {
    response = await client.send(command);
    bedrockInvocationTotal.inc({ model_id: modelId, outcome: 'success' });
  } catch (err) {
    bedrockInvocationTotal.inc({ model_id: modelId, outcome: 'error' });
    throw err;
  } finally {
    stopTimer();
  }

  const payload = JSON.parse(Buffer.from(response.body).toString('utf8'));

  const textBlock = (payload.content || []).find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Bedrock response contained no text content block');
  }
  return textBlock.text;
}

module.exports = { invokeWithFallback };
