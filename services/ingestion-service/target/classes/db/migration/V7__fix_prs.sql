-- Persists a record of every GitHub PR this platform has actually created
-- (via ScannerFindingIngestionService's "Create fix PR" flow), so it's
-- visible in the dashboard as a permanent history, not just the transient
-- result shown immediately after creation. scanner_finding_id can go null
-- if that finding is ever deleted - the PR itself still exists on GitHub
-- regardless, so this row shouldn't disappear just because its originating
-- finding did.
CREATE TABLE IF NOT EXISTS fix_pr (
    id                  BIGSERIAL PRIMARY KEY,
    scanner_finding_id  BIGINT REFERENCES scanner_finding(id) ON DELETE SET NULL,
    cve_id              VARCHAR(30) NOT NULL,
    package_name        VARCHAR(255) NOT NULL,
    old_version         VARCHAR(100),
    new_version         VARCHAR(100),
    owner               VARCHAR(255) NOT NULL,
    repo                VARCHAR(255) NOT NULL,
    branch_name         VARCHAR(255) NOT NULL,
    pr_url              VARCHAR(500) NOT NULL,
    pr_number           INTEGER NOT NULL,
    explanation         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fix_pr_cve ON fix_pr (cve_id);
CREATE INDEX IF NOT EXISTS idx_fix_pr_created_at ON fix_pr (created_at DESC);
