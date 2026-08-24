-- Phase 1 schema: normalized CVE store + ingestion bookkeeping

CREATE TABLE IF NOT EXISTS cve (
    id                  BIGSERIAL PRIMARY KEY,
    cve_id              VARCHAR(30) NOT NULL UNIQUE,
    description         TEXT,
    cvss_v3_score       NUMERIC(3,1),
    cvss_v3_severity    VARCHAR(20),
    cvss_v2_score       NUMERIC(3,1),
    cvss_v2_severity    VARCHAR(20),
    published_date      TIMESTAMPTZ,
    last_modified_date  TIMESTAMPTZ,
    vuln_status         VARCHAR(50),
    primary_source       VARCHAR(50) NOT NULL,        -- NVD / MITRE / VENDOR:<key>
    contributing_sources VARCHAR(255),                 -- comma separated list of all sources that reported this CVE
    vendor              VARCHAR(255),
    product             VARCHAR(255),
    cwe_ids             VARCHAR(255),
    reference_urls      TEXT,                          -- JSON array, stored as text
    raw_data            JSONB,                         -- last raw payload received, for traceability
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cve_last_modified ON cve (last_modified_date);
CREATE INDEX IF NOT EXISTS idx_cve_published ON cve (published_date);
CREATE INDEX IF NOT EXISTS idx_cve_severity ON cve (cvss_v3_severity);

-- Tracks the last successful sync point per ingestion source, enabling incremental pulls.
CREATE TABLE IF NOT EXISTS ingestion_state (
    source              VARCHAR(50) PRIMARY KEY,
    last_sync_time       TIMESTAMPTZ,
    last_run_status      VARCHAR(20),
    last_run_at          TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit trail of every ingestion run, for monitoring/troubleshooting.
CREATE TABLE IF NOT EXISTS ingestion_log (
    id                  BIGSERIAL PRIMARY KEY,
    source              VARCHAR(50) NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    finished_at         TIMESTAMPTZ,
    status              VARCHAR(20) NOT NULL,          -- RUNNING / SUCCESS / FAILED
    records_fetched     INTEGER DEFAULT 0,
    records_inserted    INTEGER DEFAULT 0,
    records_updated     INTEGER DEFAULT 0,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_log_source ON ingestion_log (source, started_at DESC);
