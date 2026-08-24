const { generateAnalysis, extractCveId, extractCvssScore, levelForScore } = require('../src/responseGenerator');

describe('extractCveId', () => {
  it('finds a CVE ID anywhere in the prompt text', () => {
    expect(extractCveId('CVE ID: CVE-2024-12345\nDescription: ...')).toBe('CVE-2024-12345');
  });

  it('falls back to UNKNOWN-CVE when no ID is present', () => {
    expect(extractCveId('no id here')).toBe('UNKNOWN-CVE');
  });
});

describe('extractCvssScore', () => {
  it('parses the CVSS v3 score line format used by ai-analysis-service prompts', () => {
    expect(extractCvssScore('CVSS v3 Score: 9.8 (CRITICAL)')).toBe(9.8);
  });

  it('returns null when no CVSS score is present', () => {
    expect(extractCvssScore('no score here')).toBeNull();
  });
});

describe('levelForScore', () => {
  it.each([
    [null, 'MEDIUM'],
    [9.8, 'CRITICAL'],
    [9.0, 'CRITICAL'],
    [7.5, 'HIGH'],
    [7.0, 'HIGH'],
    [5.0, 'MEDIUM'],
    [4.0, 'MEDIUM'],
    [2.0, 'LOW'],
    [0.0, 'LOW'],
  ])('maps score %p to level %p', (score, expected) => {
    expect(levelForScore(score)).toBe(expected);
  });
});

describe('generateAnalysis', () => {
  it('returns a schema-valid analysis object', () => {
    const result = generateAnalysis('CVE ID: CVE-2024-99999\nCVSS v3 Score: 9.8 (CRITICAL)');

    expect(result).toHaveProperty('simplifiedDescription');
    expect(result).toHaveProperty('exploitabilityLevel', 'CRITICAL');
    expect(result).toHaveProperty('exploitabilityRationale');
    expect(result).toHaveProperty('potentialImpact');
    expect(Array.isArray(result.remediationRecommendations)).toBe(true);
    expect(result.remediationRecommendations.length).toBeGreaterThan(0);
    expect(result.remediationRecommendations[0]).toHaveProperty('step');
    expect(result.remediationRecommendations[0]).toHaveProperty('priority');
  });

  it('clearly marks every field as mock output, so it can never be mistaken for a real analysis', () => {
    const result = generateAnalysis('CVE ID: CVE-2024-11111');
    expect(result.simplifiedDescription).toContain('[mock-bedrock]');
    expect(result.exploitabilityRationale).toContain('[mock-bedrock]');
    expect(result.potentialImpact).toContain('[mock-bedrock]');
  });
});
