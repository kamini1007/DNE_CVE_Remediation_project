const request = require('supertest');
const { createApp } = require('../src/server');

describe('GET /health', () => {
  it('returns 200 with service identification', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('mock-bedrock');
  });
});

describe('POST /model/:modelId/invoke', () => {
  it('mirrors the real Bedrock InvokeModel response shape that bedrockClient.js expects', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/model/anthropic.claude-3-5-sonnet-20241022-v2:0/invoke')
      .send({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        system: 'You are a security analyst...',
        messages: [{ role: 'user', content: 'CVE ID: CVE-2024-12345\nCVSS v3 Score: 9.8 (CRITICAL)' }],
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.content)).toBe(true);
    const textBlock = res.body.content.find((b) => b.type === 'text');
    expect(textBlock).toBeDefined();

    const parsed = JSON.parse(textBlock.text);
    expect(parsed.exploitabilityLevel).toBe('CRITICAL');
  });

  it('returns 400 when the request has no user message', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/model/anthropic.claude-3-haiku-20240307-v1:0/invoke')
      .send({ messages: [] });

    expect(res.status).toBe(400);
  });
});
