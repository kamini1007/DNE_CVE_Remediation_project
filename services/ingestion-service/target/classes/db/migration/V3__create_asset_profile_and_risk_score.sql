-- asset_profile: lets an org describe how critical/exposed/impactful a given
-- vendor+product is to their environment. risk-engine-service matches each
-- CVE's (vendor, product) against this table - most specific match wins:
-- exact vendor+product > vendor-only > the seeded global default (both NULL).
CREATE TABLE IF NOT EXISTS asset_profile (
    id                BIGSERIAL PRIMARY KEY,
    vendor            VARCHAR(255),              -- NULL = matches any vendor
    product           VARCHAR(255),              -- NULL = matches any product (for this vendor, or globally if vendor is also NULL)
    criticality       VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',       -- LOW / MEDIUM / HIGH / CRITICAL
    network_exposure  VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',     -- INTERNAL / DMZ / PUBLIC_INTERNET
    business_impact   VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',       -- LOW / MEDIUM / HIGH / CRITICAL
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (vendor, product)
);

-- Global default fallback profile - used when no vendor/product-specific
-- profile has been configured, so every CVE still gets a risk score.
INSERT INTO asset_profile (vendor, product, criticality, network_exposure, business_impact, notes)
VALUES (NULL, NULL, 'MEDIUM', 'INTERNAL', 'MEDIUM', 'Global default fallback profile - configure specific vendor/product profiles to override.')
ON CONFLICT (vendor, product) DO NOTHING;

-- risk_score: one row per CVE holding the computed weighted risk score plus
-- each component's contribution, for explainability (so "why is this
-- CRITICAL" is answerable without recomputing).
CREATE TABLE IF NOT EXISTS risk_score (
    cve_id                      VARCHAR(30) PRIMARY KEY REFERENCES cve(cve_id) ON DELETE CASCADE,
    risk_score                  NUMERIC(5,2) NOT NULL,
    risk_level                  VARCHAR(20) NOT NULL,   -- LOW / MEDIUM / HIGH / CRITICAL
    cvss_component               NUMERIC(5,2),
    exploitability_component     NUMERIC(5,2),
    asset_criticality_component  NUMERIC(5,2),
    network_exposure_component   NUMERIC(5,2),
    business_impact_component    NUMERIC(5,2),
    matched_asset_profile_id     BIGINT REFERENCES asset_profile(id),
    scoring_model_version        VARCHAR(20) NOT NULL,   -- weights/formula version, so scores are comparable/explainable over time
    computed_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_score_level ON risk_score (risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_score_value ON risk_score (risk_score DESC);
