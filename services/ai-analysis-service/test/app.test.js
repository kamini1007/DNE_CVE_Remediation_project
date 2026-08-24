const request = require('supertest');
const { createApp } = require('../src/app');

describe('GET /health', () => {
  it('returns 200 and status UP - this is what the k8s liveness/readiness probes hit', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'UP' });
  });
});
