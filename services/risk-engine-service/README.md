# Risk Engine Service - Phase 4

Java Spring Boot microservice that combines CVE vulnerability data with organizational context into a single **0-100 risk score** per CVE. This prioritized list drives downstream remediation automation and helps teams focus on the vulnerabilities that actually matter to their environment.

Consumes:
- **`cve` table** (Phase 1) — CVSS scores
- **`cve_analysis` table** (Phase 3) — exploitability assessments
- **`asset_profile` table** (self-managed) — organizational asset criticality, network exposure, business impact

Produces:
- **`risk_score` table** — computed scores with component-level breakdown + model version

Consumed by:
- **Remediation Service** (Phase 5) — prioritizes which CVEs get playbooks + Jira tickets
- **Dashboard** (Phase 6) — drives the risk-based CVE explorer and alerts

## Architecture

### Scoring Model

```
Risk Score (0-100) = 
    CVSS Score (0-100)         × 0.35  (35% weight)
  + Exploitability (0-100)     × 0.25  (25% weight)
  + Asset Criticality (0-100)  × 0.20  (20% weight)
  + Network Exposure (0-100)   × 0.10  (10% weight)
  + Business Impact (0-100)    × 0.10  (10% weight)

Severity Mapping (configurable thresholds):
  Score ≥ 80   → CRITICAL   (drop everything, fix immediately)
  Score 60-79  → HIGH       (fix within 24-72 hours)
  Score 35-59  → MEDIUM     (plan into next sprint)
  Score < 35   → LOW        (backlog for future handling)
```

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    Risk Engine Service                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Selection Logic (CveRepository)                          │ │
│  │                                                            │ │
│  │  Include CVEs that:                                        │ │
│  │  • Have cve_analysis.status = SUCCESS (AI analysis done)  │ │
│  │  • Are newer than last risk_score.computed_at             │ │
│  │  • OR risk_score.scoring_model_version is stale           │ │
│  │  Order by: cve.cvss_v3_score DESC (highest first)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                        │                                         │
│                        ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Scoring Logic (RiskScoringService)                       │ │
│  │                                                            │ │
│  │  1. Extract/normalize factor scores:                       │ │
│  │     - CVSS: cve.cvss_v3_score (0-10 → 0-100)             │ │
│  │     - Exploitability: cve_analysis.exploitability_level   │ │
│  │       (CRITICAL→100, HIGH→75, MEDIUM→50, LOW→25)         │ │
│  │     - Asset+Exposure+Impact: from matching asset_profile  │ │
│  │       (most specific win: vendor+product > vendor > global)│ │
│  │                                                            │ │
│  │  2. Handle missing data:                                   │ │
│  │     - No CVSS: use 50 (neutral)                           │ │
│  │     - No asset profile: use global default (MEDIUM/etc)   │ │
│  │     - No exploitability: REQUIRED (must have Phase 3)     │ │
│  │                                                            │ │
│  │  3. Apply weights & compute total                         │ │
│  │  4. Map to severity level (via configurable thresholds)   │ │
│  │  5. Store component breakdown (for "why?" queries)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                        │                                         │
│                        ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Persistence (RiskScoreRepository)                        │ │
│  │                                                            │ │
│  │  Write to `risk_score` table:                              │ │
│  │  • overall_score (0-100)                                   │ │
│  │  • severity_level (LOW/MEDIUM/HIGH/CRITICAL)             │ │
│  │  • component breakdown (JSON):                             │ │
│  │    { cvss_score, exploitability_score,                     │ │
│  │      asset_criticality_score, network_exposure_score,      │ │
│  │      business_impact_score }                              │ │
│  │  • scoring_model_version                                   │ │
│  │  • computed_at timestamp                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
            ↓
     PostgreSQL
     Tables: risk_score, asset_profile
```

### Key Concepts

**Model Versioning**
Every `risk_score` row is stamped with `scoring_model_version`. When you change weights or thresholds:
1. Increment the version in `application.yml` (e.g., `v1` → `v2`)
2. Existing scores keep old version; new runs compute with new version
3. Query by version to separate A/B test results
4. Bump alone triggers a full re-score (selection logic treats stale version as "needs update")

**Asset Profiles**
Organizational configuration: "our payment gateway is CRITICAL/PUBLIC_INTERNET/BUSINESS_CRITICAL."
- Most-specific-wins matching: `vendor+product` > `vendor-only` > global default
- Global default created by Flyway migration (MEDIUM/INTERNAL/MEDIUM) — every CVE scores even with zero config
- Profiles are created/updated via REST API, never auto-computed

**Component Breakdown**
Instead of a black-box score, `risk_score.component_breakdown` is JSON:
```json
{
  "cvss_score": 79,
  "exploitability_score": 100,
  "asset_criticality_score": 100,
  "network_exposure_score": 50,
  "business_impact_score": 75,
  "weights": {
    "cvss": 0.35,
    "exploitability": 0.25,
    "asset_criticality": 0.20,
    "network_exposure": 0.10,
    "business_impact": 0.10
  },
  "overall_score": 82
}
```
Enables dashboard to show "why is this CRITICAL?" without recomputing.

## Code Structure

```
src/main/java/com/security/riskengine/
├── RiskEngineServiceApplication.java    # Spring Boot entry point
├── config/
│   ├── CorsConfig.java                  # CORS headers for local dev
│   ├── RiskEngineConfig.java            # Load weights/thresholds, validate weights sum to 1.0
│   └── SchedulingConfig.java            # @EnableScheduling
├── controller/
│   ├── RiskScoreController.java         # REST API endpoints
│   └── AssetProfileController.java      # Asset profile CRUD
├── entity/
│   ├── RiskScore.java                   # @Entity, mapped to `risk_score` table
│   └── AssetProfile.java                # @Entity, mapped to `asset_profile` table
├── repository/
│   ├── RiskScoreRepository.java         # Spring Data JPA (custom queries)
│   ├── AssetProfileRepository.java      # CRUD for profiles
│   └── CveRepository.java               # Query for unscored/stale CVEs + analyses
├── scheduler/
│   └── RiskScoringScheduler.java        # @Scheduled batch scoring
├── service/
│   ├── RiskScoringService.java          # Pure scoring logic (no DB, testable)
│   ├── AssetProfileService.java         # Profile matching logic
│   └── MetricsService.java              # Micrometer counters/timers
└── utils/
    └── CvssNormalizer.java              # Convert CVSS 0-10 scale to 0-100
```

## Running Locally

### Prerequisites
- Java 25+
- Docker & Docker Compose (or standalone PostgreSQL 16+)
- Access to data from Phases 1 & 3 (ingestion-service + ai-analysis-service must have run)

### Quickstart with Docker Compose

```bash
cd services/risk-engine-service
docker compose up --build
```

This:
1. Starts PostgreSQL (if not already running from ingestion-service)
2. Applies Flyway migrations (creates `risk_score`, `asset_profile` tables)
3. Starts risk engine on `http://localhost:8083` (or port from `application.yml`)
4. Automatically kicks off first scoring batch per cron schedule

Check logs:
```bash
docker compose logs -f risk-engine-service
```

### Running Standalone (no Docker)

Requires PostgreSQL running with data from phases 1 & 3:
```bash
# Build
mvn clean package

# Run
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=postgres java -jar target/*.jar
```

Server listens on `http://localhost:8083` (default, override with `SERVER_PORT`).

### Manually Trigger Scoring

From dashboard or via curl:
```bash
# Trigger a batch scoring run (async)
curl -X POST http://localhost:8083/api/risk/trigger

# Or with custom batch size:
curl -X POST "http://localhost:8083/api/risk/trigger?batchSize=500"

# Synchronously score one CVE right now
curl -X POST http://localhost:8083/api/risk/CVE-2024-12345
```

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` | `localhost` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `cve_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `SERVER_PORT` | `8083` | Express server port |

### application.yml — Scoring Weights & Thresholds

```yaml
risk-engine:
  model-version: v1           # Bump this when you change weights/thresholds
  
  scheduling:
    enabled: true
    cron: "0 30 */1 * * *"   # Hourly at :30
    batch-size: 1000         # CVEs scored per run
  
  weights:                    # MUST SUM TO 1.0 (validated at startup)
    cvss: 0.35               # CVSS score: 35%
    exploitability: 0.25     # AI's exploitability assessment: 25%
    asset-criticality: 0.20  # Your org's asset criticality profile: 20%
    network-exposure: 0.10   # Public vs. internal: 10%
    business-impact: 0.10    # Business criticality: 10%
  
  thresholds:                # Score ranges → severity labels
    critical: 80             # ≥80 = CRITICAL
    high: 60                 # 60-79 = HIGH
    medium: 35               # 35-59 = MEDIUM
                             # <35 = LOW
```

**Customizing weights:**
1. Edit `risk-engine.weights` in `application.yml`
2. Ensure all weights sum to 1.0 (service validates at startup)
3. Increment `risk-engine.model-version`
4. Restart service (picks up new config)
5. Next scoring batch computes all CVEs with new weights

**Example: Emphasize exploitability over asset criticality**
```yaml
risk-engine:
  model-version: v2
  weights:
    cvss: 0.30
    exploitability: 0.35    # ← increased
    asset-criticality: 0.15 # ← decreased
    network-exposure: 0.10
    business-impact: 0.10
```

## API Endpoints

### Risk Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/risk?level=CRITICAL&page=0&size=20` | Paginated risk list, highest first; filter by `level` (CRITICAL, HIGH, MEDIUM, LOW) |
| `GET` | `/api/risk/{cveId}` | Risk score + component breakdown for one CVE |
| `POST` | `/api/risk/trigger?batchSize=200` | Manually trigger scoring batch (async) |
| `POST` | `/api/risk/{cveId}` | Synchronously (re-)score one CVE now |

**Example: Get all CRITICAL risk scores**
```bash
curl "http://localhost:8083/api/risk?level=CRITICAL&size=50" | jq '.content | .[] | {cve_id, overall_score, severity_level}'
```

**Example: Get component breakdown for one CVE**
```bash
curl http://localhost:8083/api/risk/CVE-2024-12345 | jq '.component_breakdown'
```

### Asset Profile Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/asset-profiles` | List all configured profiles |
| `POST` | `/api/asset-profiles` | Create a profile |
| `PUT` | `/api/asset-profiles/{id}` | Update a profile |
| `DELETE` | `/api/asset-profiles/{id}` | Delete a profile |

**Example: Create an asset profile**
```bash
curl -X POST http://localhost:8083/api/asset-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "vendor": "nginx",
    "product": "nginx",
    "criticality": "CRITICAL",
    "networkExposure": "PUBLIC_INTERNET",
    "businessImpact": "BUSINESS_CRITICAL"
  }'
```

The service now treats all nginx CVEs as if they affect a critical, public-facing asset. Scores will be higher.

**Example: Create a global profile (no vendor/product specified)**
```bash
curl -X POST http://localhost:8083/api/asset-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "criticality": "MEDIUM",
    "networkExposure": "INTERNAL",
    "businessImpact": "MEDIUM"
  }'
```

This becomes the fallback when no specific vendor/product match exists.

### Health & Metrics

| Endpoint | Description |
|----------|-------------|
| `GET` | `/actuator/health` | Liveness probe |
| `GET` | `/actuator/metrics` | List all metrics |
| `GET` | `/actuator/metrics/risk.score.compute.duration` | Histogram: per-CVE compute time (ms) |
| `GET` | `/actuator/metrics/risk.batch.cves` | Gauge: CVEs scored per batch |

## Database Schema

### `risk_score` Table

Defined in ingestion-service's `V3__create_asset_profile_and_risk_score.sql`:

| Column | Type | Purpose |
|--------|------|---------|
| `cve_id` | VARCHAR (PK, FK→cve) | CVE identifier |
| `overall_score` | NUMERIC(5,2) | 0-100 risk score |
| `severity_level` | ENUM | LOW, MEDIUM, HIGH, CRITICAL |
| `component_breakdown` | JSON | Component scores + weights (for transparency) |
| `scoring_model_version` | VARCHAR | Version of the model that produced this score |
| `computed_at` | TIMESTAMP | When this score was calculated |
| `created_at` | TIMESTAMP | When row was first inserted |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Example component_breakdown:**
```json
{
  "cvss_score": 79.0,
  "exploitability_score": 100,
  "asset_criticality_score": 100,
  "network_exposure_score": 50,
  "business_impact_score": 75,
  "weights": {
    "cvss": 0.35,
    "exploitability": 0.25,
    "asset_criticality": 0.20,
    "network_exposure": 0.10,
    "business_impact": 0.10
  },
  "overall_score": 82.25
}
```

### `asset_profile` Table

Defined in ingestion-service's `V3__create_asset_profile_and_risk_score.sql`:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Unique profile ID |
| `vendor` | VARCHAR (nullable) | Vendor name (e.g., "nginx"); null for global profiles |
| `product` | VARCHAR (nullable) | Product name (e.g., "nginx"); null for vendor-only or global |
| `criticality` | ENUM | LOW, MEDIUM, HIGH, CRITICAL |
| `network_exposure` | ENUM | INTERNAL, DMZ, PUBLIC_INTERNET |
| `business_impact` | ENUM | LOW, MEDIUM, HIGH, BUSINESS_CRITICAL |
| `created_at` | TIMESTAMP | When profile was created |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Matching Algorithm:**
1. Look for exact `vendor + product` match
2. If not found, look for `vendor`-only match (product=null)
3. If not found, use global default (vendor=null, product=null)

## Testing

### Unit Tests

```bash
mvn test
```

**Test coverage:**
- `RiskScoringServiceTest`: pure scoring math
  - Min/max bounds (0-100 maintained)
  - Missing CVSS fallback to 50
  - Unknown exploitability neutrality
  - Monotonicity: higher input → higher output
  - Component breakdown correctness
  - Threshold mapping (score → severity level)
- `AssetProfileServiceTest`: profile matching
  - Exact vendor+product match wins
  - Vendor-only match if no exact
  - Global default as fallback
  - Null-safety
- `RiskScoreRepositoryTest`: data persistence
  - Upsert by CVE ID
  - Model version tracking
  - Timestamp updates

### Integration Tests (with Testcontainers)

```bash
mvn verify
```

PostgreSQL container spins up; tests verify:
- Flyway migrations apply correctly
- Scores computed and persisted
- Asset profiles queried in correct matching order
- Scheduling batch runs work end-to-end

## Monitoring & Observability

### Metrics Exposed

- `risk.batch.runs.total` — counter: cumulative batch runs
- `risk.batch.runs.duration.seconds` — histogram: per-batch duration
- `risk.score.compute.duration.seconds` — histogram: per-CVE score compute time
- `risk.cves.scored.total` — counter: cumulative CVEs scored
- `risk.scores.created.total` — counter: new score rows created
- `risk.scores.updated.total` — counter: existing score rows updated
- `risk.profile.matches.{exact,vendor,global}` — counters: which matching strategy used

**Scrape endpoint:** `http://localhost:8083/actuator/prometheus`

### Logging

- **Log level**: Controlled by `logging.level` in `application.yml` (default: DEBUG for `com.security.riskengine`)
- **Format**: Spring Boot default (timestamp, level, logger name, message)

Example output:
```
2024-08-26 14:35:30 INFO [risk-engine] com.security.riskengine.scheduler.RiskScoringScheduler - Starting risk scoring batch (batchSize=1000, modelVersion=v1)
2024-08-26 14:35:31 INFO [risk-engine] com.security.riskengine.service.RiskScoringService - Retrieved 800 unscored CVEs
2024-08-26 14:35:32 DEBUG [risk-engine] com.security.riskengine.service.RiskScoringService - Scoring CVE-2024-12345: cvss=9.8, exploitability=CRITICAL, profile=nginx→CRITICAL → overall=85 (CRITICAL)
2024-08-26 14:35:45 INFO [risk-engine] com.security.riskengine.scheduler.RiskScoringScheduler - Batch complete: 800 scored, 0 failed (15.2s)
```

## Troubleshooting

### "Weights do not sum to 1.0"
- Check `risk-engine.weights` in `application.yml`
- All weights must sum to exactly 1.0 (or very close, accounting for floating-point rounding)
- Example: 0.35 + 0.25 + 0.20 + 0.10 + 0.10 = 1.0 ✓

### "No CVEs are being scored"
- Ensure ingestion-service and ai-analysis-service have run first (CVEs need `cve_analysis.status = SUCCESS`)
- Check selection query: `SELECT COUNT(*) FROM cve_analysis WHERE status = 'SUCCESS';`
- Verify scheduling is enabled: `risk-engine.scheduling.enabled: true` in `application.yml`

### "Asset profiles aren't being applied"
- List profiles: `curl http://localhost:8083/api/asset-profiles`
- Verify vendor/product match against CVE data: `curl http://localhost:8080/api/cves/CVE-2024-12345 | jq '.vendor, .product'`
- Profile matching is case-sensitive: "nginx" ≠ "Nginx"

### "Scores changed after I updated weights"
- Old scores keep `scoring_model_version` from when they were computed
- New scores get new version
- Re-score older CVEs by bumping version (triggers full re-compute) or hitting the `/api/risk/trigger` endpoint

## What's Next (Phase 5+)

- remediation-service will consume `GET /api/risk` to prioritize which CVEs get playbooks + Jira tickets
- learning-service (Phase 8) will track whether high-risk findings actually got exploited, enabling feedback loop

## Contributing

See main platform README. For risk-engine specifically:
- Scoring logic must be in `RiskScoringService` (pure, testable, no side effects)
- All formula changes require a new `model-version`
- Update thresholds only via `application.yml`; never hardcode them
