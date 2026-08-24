const { parseAnalysisResponse } = require('../src/bedrock/responseParser');

const VALID_RESPONSE = JSON.stringify({
  simplifiedDescription: 'An attacker can crash the service by sending a malformed request.',
  exploitabilityLevel: 'HIGH',
  exploitabilityRationale: 'No authentication required and a public PoC exists.',
  potentialImpact: 'Denial of service on the affected component.',
  remediationRecommendations: [
    { step: 'Upgrade to version 2.3.1 or later', priority: 'IMMEDIATE' },
    { step: 'Restrict network access to the admin interface', priority: 'HIGH' },
  ],
});

describe('parseAnalysisResponse', () => {
  it('parses a clean JSON response', () => {
    const result = parseAnalysisResponse(VALID_RESPONSE);
    expect(result.exploitabilityLevel).toBe('HIGH');
    expect(result.remediationRecommendations).toHaveLength(2);
    expect(result.remediationRecommendations[0].priority).toBe('IMMEDIATE');
  });

  it('strips markdown code fences models sometimes add despite instructions', () => {
    const fenced = '```json\n' + VALID_RESPONSE + '\n```';
    const result = parseAnalysisResponse(fenced);
    expect(result.simplifiedDescription).toContain('crash the service');
  });

  it('falls back to UNKNOWN for an invalid exploitability level', () => {
    const bad = JSON.stringify({ ...JSON.parse(VALID_RESPONSE), exploitabilityLevel: 'SUPER_BAD' });
    const result = parseAnalysisResponse(bad);
    expect(result.exploitabilityLevel).toBe('UNKNOWN');
  });

  it('defaults an invalid recommendation priority to MEDIUM rather than dropping the step', () => {
    const bad = JSON.stringify({
      ...JSON.parse(VALID_RESPONSE),
      remediationRecommendations: [{ step: 'Patch it', priority: 'ASAP!!' }],
    });
    const result = parseAnalysisResponse(bad);
    expect(result.remediationRecommendations[0]).toEqual({ step: 'Patch it', priority: 'MEDIUM' });
  });

  it('filters out malformed recommendation entries missing a step', () => {
    const bad = JSON.stringify({
      ...JSON.parse(VALID_RESPONSE),
      remediationRecommendations: [{ priority: 'HIGH' }, { step: 'Valid step', priority: 'LOW' }],
    });
    const result = parseAnalysisResponse(bad);
    expect(result.remediationRecommendations).toHaveLength(1);
    expect(result.remediationRecommendations[0].step).toBe('Valid step');
  });

  it('throws a clear error on unparseable text', () => {
    expect(() => parseAnalysisResponse('this is not json at all')).toThrow(/not valid JSON/);
  });
});
