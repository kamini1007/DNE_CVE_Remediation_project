-- cve_analysis: one row per CVE holding the Bedrock-generated analysis
-- (simplified description, exploitability, impact, remediation steps).
-- Kept in the same Flyway-managed schema as `cve` (rather than the
-- ai-analysis-service running its own migration) so there is exactly one
-- source of truth for the schema and no cross-service migration-ordering
-- dependency at startup.

CREATE TABLE IF NOT EXISTS cve_analysis (
    cve_id                        VARCHAR(30) PRIMARY KEY REFERENCES cve(cve_id) ON DELETE CASCADE,
    simplified_description        TEXT,
    exploitability_level          VARCHAR(20),   -- LOW / MEDIUM / HIGH / CRITICAL / UNKNOWN
    exploitability_rationale      TEXT,
    potential_impact              TEXT,
    remediation_recommendations   JSONB,          -- [{ "step": "...", "priority": "IMMEDIATE|HIGH|MEDIUM|LOW" }, ...]
    model_id                      VARCHAR(100),
    status                        VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- SUCCESS / FAILED / PENDING
    error_message                 TEXT,
    raw_model_response             TEXT,
    analyzed_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cve_analysis_status ON cve_analysis (status);
CREATE INDEX IF NOT EXISTS idx_cve_analysis_exploitability ON cve_analysis (exploitability_level);
