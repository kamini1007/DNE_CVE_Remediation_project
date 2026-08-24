const { buildUserPrompt, SYSTEM_PROMPT } = require('../src/prompts/cveAnalysisPrompt');

describe('buildUserPrompt', () => {
  it('includes all present fields', () => {
    const cve = {
      cve_id: 'CVE-2024-12345',
      description: 'A buffer overflow in Example Widget allows remote code execution.',
      cvss_v3_score: 9.8,
      cvss_v3_severity: 'CRITICAL',
      cvss_v2_score: null,
      cwe_ids: 'CWE-120',
      vendor: 'ExampleCorp',
      product: 'Widget',
      vuln_status: 'Analyzed',
      published_date: '2024-01-15T00:00:00Z',
      last_modified_date: '2024-01-20T00:00:00Z',
      reference_urls: '["https://example.com/advisory"]',
    };

    const prompt = buildUserPrompt(cve);

    expect(prompt).toContain('CVE-2024-12345');
    expect(prompt).toContain('buffer overflow');
    expect(prompt).toContain('9.8 (CRITICAL)');
    expect(prompt).toContain('CWE-120');
    expect(prompt).toContain('ExampleCorp');
    expect(prompt).toContain('Widget');
  });

  it('omits fields that are null/undefined rather than printing "null"', () => {
    const cve = { cve_id: 'CVE-2024-99999', description: null, cvss_v3_score: null };
    const prompt = buildUserPrompt(cve);

    expect(prompt).toContain('CVE-2024-99999');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('undefined');
  });
});

describe('SYSTEM_PROMPT', () => {
  it('instructs the model to return only JSON with the expected fields', () => {
    expect(SYSTEM_PROMPT).toContain('simplifiedDescription');
    expect(SYSTEM_PROMPT).toContain('exploitabilityLevel');
    expect(SYSTEM_PROMPT).toContain('remediationRecommendations');
    expect(SYSTEM_PROMPT).toMatch(/only.*JSON/i);
  });
});
