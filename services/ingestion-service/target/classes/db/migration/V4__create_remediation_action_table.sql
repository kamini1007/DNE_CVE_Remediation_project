-- remediation_action: one row per CVE holding the generated remediation
-- playbook and, if Jira is configured, the resulting ticket reference.
-- Consumes risk_score (Phase 4) and cve_analysis (Phase 3) - only CVEs that
-- have both get a remediation action, since the playbook needs the AI's
-- remediation recommendations and the urgency needs the risk level.

CREATE TABLE IF NOT EXISTS remediation_action (
    cve_id                  VARCHAR(30) PRIMARY KEY REFERENCES cve(cve_id) ON DELETE CASCADE,
    risk_score_snapshot     NUMERIC(5,2),
    risk_level_snapshot     VARCHAR(20),
    playbook                JSONB NOT NULL,            -- { summary, urgency, dueBy, steps: [{order, action, owner}] }
    jira_ticket_key         VARCHAR(50),                -- e.g. "SEC-1234" - NULL if Jira isn't configured (dry-run mode)
    jira_ticket_url         TEXT,
    status                  VARCHAR(20) NOT NULL,       -- PLAYBOOK_GENERATED / TICKET_CREATED / FAILED
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remediation_status ON remediation_action (status);
CREATE INDEX IF NOT EXISTS idx_remediation_risk_level ON remediation_action (risk_level_snapshot);
