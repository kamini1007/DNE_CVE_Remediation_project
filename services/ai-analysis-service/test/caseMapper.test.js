const { toCamelCase, toCamelCaseList } = require('../src/utils/caseMapper');

describe('toCamelCase', () => {
  it('converts snake_case keys to camelCase', () => {
    const row = {
      cve_id: 'CVE-2024-1',
      simplified_description: 'text',
      exploitability_level: 'HIGH',
      analyzed_at: '2024-01-01T00:00:00Z',
    };

    expect(toCamelCase(row)).toEqual({
      cveId: 'CVE-2024-1',
      simplifiedDescription: 'text',
      exploitabilityLevel: 'HIGH',
      analyzedAt: '2024-01-01T00:00:00Z',
    });
  });

  it('leaves already-camelCase and single-word keys untouched', () => {
    expect(toCamelCase({ status: 'SUCCESS', modelId: 'x' })).toEqual({ status: 'SUCCESS', modelId: 'x' });
  });

  it('preserves values as-is, including nested objects', () => {
    const nested = { steps: [{ order: 1, action: 'Patch' }] };
    const result = toCamelCase({ playbook: nested, risk_level_snapshot: 'HIGH' });

    expect(result.playbook).toBe(nested); // same reference - nested keys deliberately untouched
    expect(result.riskLevelSnapshot).toBe('HIGH');
  });

  it('passes through null and undefined without throwing', () => {
    expect(toCamelCase(null)).toBeNull();
    expect(toCamelCase(undefined)).toBeUndefined();
  });
});

describe('toCamelCaseList', () => {
  it('maps every row in a list', () => {
    const rows = [{ cve_id: 'CVE-1' }, { cve_id: 'CVE-2' }];
    expect(toCamelCaseList(rows)).toEqual([{ cveId: 'CVE-1' }, { cveId: 'CVE-2' }]);
  });

  it('returns an empty array unchanged', () => {
    expect(toCamelCaseList([])).toEqual([]);
  });
});
