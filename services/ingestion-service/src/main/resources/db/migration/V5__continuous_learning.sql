-- Phase 8: Continuous Learning
--
-- Three additions, all in service of the same idea - capture ground truth
-- about how well the pipeline's judgments held up, so a human can decide
-- what to tune. Nothing here auto-adjusts risk-engine.weights or the AI
-- prompt; that stays a deliberate, reviewed change.

-- Structured feedback from analysts on a specific CVE's AI analysis or risk
-- score. Free-standing rather than a column on cve_analysis/risk_score,
-- since a CVE can accumulate multiple feedback entries over time (e.g. after
-- a re-analysis) and history matters for calibration, not just the latest view.
CREATE TABLE IF NOT EXISTS feedback (
    id              BIGSERIAL PRIMARY KEY,
    cve_id          VARCHAR(30) NOT NULL REFERENCES cve(cve_id) ON DELETE CASCADE,
    feedback_type   VARCHAR(30) NOT NULL,   -- ANALYSIS_ACCURACY / RISK_ACCURACY / REMEDIATION_OUTCOME
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    submitted_by    VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_cve ON feedback (cve_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback (feedback_type);

-- Ground truth for remediation: did the ticket actually get resolved, and
-- did it happen within the playbook's own SLA window? Extends
-- remediation_action (Phase 5's table) rather than a new table, since this
-- is the natural lifecycle continuation of the same row - remediation-service
-- still owns all reads/writes to it, just polling Jira for status now too.
ALTER TABLE remediation_action ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE remediation_action ADD COLUMN IF NOT EXISTS time_to_resolution_hours NUMERIC(8,2);
ALTER TABLE remediation_action ADD COLUMN IF NOT EXISTS met_sla BOOLEAN;

-- Which system-prompt version produced a given analysis, so feedback can be
-- correlated to a specific prompt rather than "the AI" in the abstract -
-- the whole point of tracking this is answering "did the prompt change we
-- made in March actually improve accuracy?"
ALTER TABLE cve_analysis ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20);

-- Calibration reports: periodic, explainable snapshots comparing predicted
-- risk/analysis quality against the ground truth above. `recommendations` is
-- plain-language, rule-based, and requires a human to act on it - nothing
-- reads this table and changes scoring behavior automatically.
CREATE TABLE IF NOT EXISTS calibration_report (
    id                BIGSERIAL PRIMARY KEY,
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    risk_level_stats  JSONB NOT NULL,   -- [{level, feedbackCount, avgRating, slaMetRate, resolvedCount}, ...]
    prompt_version_stats JSONB NOT NULL, -- [{promptVersion, feedbackCount, avgRating}, ...]
    recommendations   JSONB NOT NULL     -- [{severity, message}, ...] - human-readable, for review only
);

CREATE INDEX IF NOT EXISTS idx_calibration_report_generated ON calibration_report (generated_at DESC);
