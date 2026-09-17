-- Soft-archival: CVEs older than the configured retention period get
-- flagged (archived_at set), not physically moved or deleted. Nothing
-- else in the schema changes - no foreign keys break, cve_analysis/
-- risk_score/remediation_action/scanner_finding/fix_pr all keep working
-- exactly as before for archived CVEs, they just don't show up in
-- default "active" listings once a query opts into filtering on this.
ALTER TABLE cve ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- A partial index - only indexes the (large, common) set of NOT-archived
-- rows, which is exactly the subset most queries will actually filter on
-- day to day. Genuinely speeds up "active CVEs only" queries without
-- needing to physically shrink the table.
CREATE INDEX IF NOT EXISTS idx_cve_not_archived ON cve (published_date) WHERE archived_at IS NULL;
