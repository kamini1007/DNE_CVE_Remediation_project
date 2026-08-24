const express = require('express');
const { generateAnalysis } = require('./responseGenerator');

function createApp() {
  const app = express();
  // AWS SDK sends the raw Anthropic-format JSON body with Content-Type: application/json.
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'UP', service: 'mock-bedrock' }));

  // Mirrors the real Bedrock Runtime InvokeModel path: POST /model/{modelId}/invoke
  app.post('/model/:modelId/invoke', (req, res) => {
    const { modelId } = req.params;
    const { messages } = req.body || {};

    const userMessage = Array.isArray(messages) ? messages.find((m) => m.role === 'user') : null;
    const promptText = userMessage?.content || '';

    if (!promptText) {
      return res.status(400).json({ message: 'Request body missing a user message - not a valid Anthropic Messages API payload' });
    }

    const analysis = generateAnalysis(promptText);
    const responseText = JSON.stringify(analysis);

    // Shape mirrors what Bedrock actually returns for Anthropic models, so
    // bedrockClient.js needs zero changes to talk to this instead of real AWS.
    res.json({
      id: `mock-msg-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: modelId,
      content: [{ type: 'text', text: responseText }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: Math.ceil(promptText.length / 4),
        output_tokens: Math.ceil(responseText.length / 4),
      },
    });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    // eslint-disable-next-line no-console
    console.error('[mock-bedrock] unhandled error:', err);
    res.status(500).json({ message: 'Internal mock-bedrock error' });
  });

  return app;
}

module.exports = { createApp };
