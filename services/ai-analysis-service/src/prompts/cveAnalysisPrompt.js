// Bump this whenever SYSTEM_PROMPT changes materially. Every analysis stores
// the version it was produced under (cve_analysis.prompt_version), so
// learning-service's calibration reports can answer "did this prompt
// revision actually improve accuracy?" instead of just "the AI" in the abstract.
const PROMPT_VERSION = 'v1';

const SYSTEM_PROMPT = `You are a senior application security analyst. You will be given
structured data about a single CVE (Common Vulnerabilities and Exposures) record.

Respond with ONLY a single JSON object (no markdown fences, no preamble, no
trailing commentary) with exactly these fields:

{
  "simplifiedDescription": string,        // 2-4 plain-language sentences a non-security engineer can understand
  "exploitabilityLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "exploitabilityRationale": string,      // 1-3 sentences: why that level, referencing attack vector/complexity/auth if known
  "potentialImpact": string,              // 1-3 sentences: confidentiality/integrity/availability consequences if exploited
  "remediationRecommendations": [
    { "step": string, "priority": "IMMEDIATE" | "HIGH" | "MEDIUM" | "LOW" }
  ]                                        // 1-5 concrete, actionable steps, ordered most important first
}

Base your assessment only on the data provided. If CVSS data is present, let it
anchor your exploitability level rather than contradicting it without reason.
If information is missing or ambiguous, say so briefly in the rationale rather
than inventing specifics. Do not include any text outside the JSON object.`;

function buildUserPrompt(cve) {
  const lines = [
    `CVE ID: ${cve.cve_id}`,
    cve.description ? `Description: ${cve.description}` : null,
    cve.cvss_v3_score != null ? `CVSS v3 Score: ${cve.cvss_v3_score} (${cve.cvss_v3_severity || 'unknown severity'})` : null,
    cve.cvss_v2_score != null ? `CVSS v2 Score: ${cve.cvss_v2_score}` : null,
    cve.cwe_ids ? `CWE(s): ${cve.cwe_ids}` : null,
    cve.vendor ? `Vendor: ${cve.vendor}` : null,
    cve.product ? `Product: ${cve.product}` : null,
    cve.vuln_status ? `Status: ${cve.vuln_status}` : null,
    cve.published_date ? `Published: ${cve.published_date}` : null,
    cve.last_modified_date ? `Last modified: ${cve.last_modified_date}` : null,
    cve.reference_urls ? `Reference URLs: ${cve.reference_urls}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

module.exports = { SYSTEM_PROMPT, buildUserPrompt, PROMPT_VERSION };
