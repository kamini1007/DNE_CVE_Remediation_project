-- Scanner findings: records that CVE X was found in project Y's dependency Z
-- at a specific installed version, by an external scanner (Trivy, etc.).
--
-- Deliberately separate from `cve` (which is global - one row per CVE ID,
-- ever) since a scanner finding is inherently project-specific: the same
-- CVE can show up in multiple projects, or multiple packages within one
-- project. The cve_id foreign key means every scanner finding's CVE flows
-- through the existing pipeline unchanged - AI analysis, risk scoring, and
-- remediation all just see another row in `cve`, with no idea (or need to
-- know) it originated from a scan rather than NVD/MITRE/a vendor feed.
--
-- Upserted (not append-only history) on (cve_id, project_name, package_name) -
-- re-scanning the same project just refreshes installed/fixed version and
-- scanned_at, consistent with how cve_analysis/risk_score/remediation_action
-- are all "latest state," not history tables.
CREATE TABLE IF NOT EXISTS scanner_finding (
    id                  BIGSERIAL PRIMARY KEY,
    cve_id              VARCHAR(30) NOT NULL REFERENCES cve(cve_id) ON DELETE CASCADE,
    project_name        VARCHAR(255) NOT NULL,
    package_name        VARCHAR(255) NOT NULL,
    installed_version   VARCHAR(100),
    fixed_version       VARCHAR(100),
    scanner_source       VARCHAR(50) NOT NULL,   -- e.g. 'trivy' - other scanners can be added later
    target              VARCHAR(500),             -- what Trivy actually scanned, e.g. "package-lock.json"
    scanned_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cve_id, project_name, package_name)
);

CREATE INDEX IF NOT EXISTS idx_scanner_finding_cve ON scanner_finding (cve_id);
CREATE INDEX IF NOT EXISTS idx_scanner_finding_project ON scanner_finding (project_name);
