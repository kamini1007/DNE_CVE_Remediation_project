const { buildPlaybook } = require('../src/services/playbookService');

function scoredCve(overrides = {}) {
  return {
    cve_id: 'CVE-2024-12345',
    risk_level: 'CRITICAL',
    exploitability_level: 'HIGH',
    potential_impact: 'Full system compromise possible.',
    remediation_recommendations: [
      { step: 'Upgrade to version 2.3.1', priority: 'IMMEDIATE' },
      { step: 'Restrict network access', priority: 'HIGH' },
    ],
    ...overrides,
  };
}

describe('buildPlaybook', () => {
  it('includes the AI recommendations as the first steps, in order', () => {
    const playbook = buildPlaybook(scoredCve());

    expect(playbook.steps[0].action).toBe('Upgrade to version 2.3.1');
    expect(playbook.steps[0].order).toBe(1);
    expect(playbook.steps[1].action).toBe('Restrict network access');
    expect(playbook.steps[1].order).toBe(2);
  });

  it('always appends verification and closure steps after the AI recommendations', () => {
    const playbook = buildPlaybook(scoredCve());
    const lastTwo = playbook.steps.slice(-2);

    expect(lastTwo[0].action).toContain('Verify the remediation is effective');
    expect(lastTwo[1].action).toContain('Close out tracking');
  });

  it('maps risk level to the correct SLA window', () => {
    expect(buildPlaybook(scoredCve({ risk_level: 'CRITICAL' })).dueByHours).toBe(24);
    expect(buildPlaybook(scoredCve({ risk_level: 'HIGH' })).dueByHours).toBe(72);
    expect(buildPlaybook(scoredCve({ risk_level: 'MEDIUM' })).dueByHours).toBe(336);
    expect(buildPlaybook(scoredCve({ risk_level: 'LOW' })).dueByHours).toBe(720);
  });

  it('sets urgency to the risk level', () => {
    expect(buildPlaybook(scoredCve({ risk_level: 'HIGH' })).urgency).toBe('HIGH');
  });

  it('handles a CVE with no AI recommendations by still producing the standard closing steps', () => {
    const playbook = buildPlaybook(scoredCve({ remediation_recommendations: [] }));

    expect(playbook.steps).toHaveLength(2);
    expect(playbook.steps[0].action).toContain('Verify the remediation is effective');
  });

  it('builds a summary mentioning the CVE ID, risk level, and exploitability', () => {
    const playbook = buildPlaybook(scoredCve());

    expect(playbook.summary).toContain('CVE-2024-12345');
    expect(playbook.summary).toContain('CRITICAL');
    expect(playbook.summary).toContain('HIGH');
  });

  it('works with camelCase field names too, not just raw snake_case pg rows', () => {
    const playbook = buildPlaybook({
      cveId: 'CVE-2024-99999',
      riskLevel: 'MEDIUM',
      exploitabilityLevel: 'LOW',
      remediationRecommendations: [{ step: 'Patch it', priority: 'MEDIUM' }],
    });

    expect(playbook.summary).toContain('CVE-2024-99999');
    expect(playbook.steps[0].action).toBe('Patch it');
  });
});
