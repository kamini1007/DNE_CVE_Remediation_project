# Risk Prioritization Engine (Phase 4)

Java Spring Boot service that combines five weighted factors into a single
0-100 risk score per CVE, producing the prioritized vulnerability list:

- **CVSS score** (v3, falling back to v2, then a neutral 50 if neither exists)
- **Exploitability** (from ai-analysis-service's Bedrock output in `cve_analysis`)
- **Asset criticality**, **network exposure**, **business impact** (from the
  best-matching `asset_profile` row for the CVE's vendor/product)

## Scoring model

Each factor is scaled to 0-100, then combined with configurable weights
(`risk-engine.weights` in `application.yml`, must sum to 1.0 - validated at
startup):

```
score = cvss*0.35 + exploitability*0.25 + assetCriticality*0.20 + networkExposure*0.10 + businessImpact*0.10
```

Bucketed into LOW/MEDIUM/HIGH/CRITICAL via `risk-engine.thresholds`. Every
component's individual contribution is stored alongside the total in
`risk_score`, so "why is this CRITICAL" is answerable without recomputing.

`risk-engine.model-version` is stamped onto every row; bump it whenever you
change the weights/formula so old and new scores aren't silently conflated,
and so a version bump alone is enough to trigger a full re-score (the
candidate query treats a stale `scoring_model_version` the same as a stale
`computed_at`).

## Asset profiles

Configure via `POST /api/asset-profiles` (see below) - e.g. "our
internet-facing payment gateway running NGINX is CRITICAL/PUBLIC_INTERNET/CRITICAL".
Matching is most-specific-wins: exact vendor+product > vendor-only > the
global default profile (seeded by the Flyway migration, `MEDIUM`/`INTERNAL`/`MEDIUM`)
so every CVE gets scored even with zero configuration.

## Schema ownership

`asset_profile` and `risk_score` are defined in **ingestion-service's** Flyway
migrations (`V3__create_asset_profile_and_risk_score.sql`) - same
single-schema-authority pattern as Phase 3. This service reads `cve` and
`cve_analysis` (owned by ingestion-service and ai-analysis-service
respectively) and owns all reads/writes to `asset_profile` and `risk_score`
itself.

## API

| Endpoint | Description |
|---|---|
| `GET /api/risk?level=CRITICAL&page=0&size=20` | Prioritized vulnerability list, highest risk first, optionally filtered by level. |
| `GET /api/risk/{cveId}` | Risk score + component breakdown for one CVE. |
| `POST /api/risk/trigger?batchSize=200` | Manually trigger a scoring batch (async). |
| `POST /api/risk/{cveId}` | Synchronously (re-)score one CVE now. |
| `GET /api/asset-profiles` | List all configured asset profiles. |
| `POST /api/asset-profiles` | Create a profile: `{ "vendor": "...", "product": "...", "criticality": "HIGH", "networkExposure": "DMZ", "businessImpact": "HIGH" }`. Omit vendor/product for a broader match. |
| `PUT /api/asset-profiles/{id}` / `DELETE /api/asset-profiles/{id}` | Update/remove a profile. |

## Running locally

```bash
mvn clean package
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=postgres java -jar target/*.jar
```

Requires `cve`, `cve_analysis`, `asset_profile`, and `risk_score` to already
exist - i.e. ingestion-service's Flyway migrations must have run first - and
at least some CVEs to have a successful ai-analysis-service analysis, since
`exploitabilityLevel` is a required scoring input.

## Testing

```bash
mvn test
```

`RiskScoringServiceTest` covers the pure scoring math directly (no DB/Spring
context needed): min/max bounds, missing-CVSS fallback, unknown-exploitability
neutrality, monotonicity (higher CVSS never lowers the score), and the
startup weight-sum validation.

## What's next (Phase 5)

remediation-service will consume `GET /api/risk` to drive patch
recommendations, remediation playbooks, and automatic Jira ticket creation
for the highest-priority CVEs.
