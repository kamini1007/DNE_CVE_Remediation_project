const request = require('supertest');
const { createApp } = require('../src/app');
const { register, analysisTotal } = require('../src/metrics/metrics');

describe('GET /metrics', () => {
  it('exposes Prometheus-format metrics for scraping', async () => {
    const app = createApp();
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    // Default Node process metrics should always be present.
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });

  it('includes the application label so metrics are attributable per service', async () => {
    const app = createApp();
    const res = await request(app).get('/metrics');

    expect(res.text).toContain('application="ai-analysis-service"');
  });

  it('reflects domain counter increments', async () => {
    analysisTotal.inc({ status: 'SUCCESS' });

    const metrics = await register.metrics();
    expect(metrics).toContain('cve_analysis_total');
    expect(metrics).toMatch(/cve_analysis_total\{[^}]*status="SUCCESS"[^}]*\}\s+\d+/);
  });
});
