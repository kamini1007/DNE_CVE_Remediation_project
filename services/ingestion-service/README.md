# CVE Ingestion Service - Phase 1

Spring Boot microservice that orchestrates the ingestion of CVE vulnerability data from multiple authoritative sources (NVD, MITRE CVE Program, vendor security advisories), normalizes the data into a unified schema, and persists it to PostgreSQL on independently-scheduled cron jobs.

This is the **data foundation** for the entire remediation platform — all downstream services (AI analysis, risk scoring, remediation) depend on the normalized CVE records produced here.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CVE Ingestion Service                         │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────┐                │
│  │  Source Connectors   │  │ Normalizer       │                │
│  ├──────────────────────┤  ├──────────────────┤                │
│  │ • NvdConnector       │  │ CveNormalizer    │                │
│  │ • MitreConnector     ├─▶│ Service          ├─▶ Flyway ────▶│
│  │ • VendorAdvisory     │  │                  │   Migrations   │
│  │   Connector          │  │ (multi-source    │                │
│  │                      │  │  merge/conflict  │                │
│  └──────────────────────┘  │  resolution)     │                │
│                             └──────────────────┘                │
│  ┌──────────────────────────┐  ┌────────────────┐              │
│  │ IngestionScheduler       │  │ Persistence    │              │
│  ├──────────────────────────┤  ├────────────────┤              │
│  │ @Scheduled tasks:        │  │ CveRepository  │              │
│  │ • NVD (every 30 min)     ├─▶│ (JPA Entity)   ├─▶ PostgreSQL│
│  │ • MITRE (hourly @ :15)   │  │                │   Tables:   │
│  │ • Vendor (every 2h @ :45)│  │ Audit Logging  │   • cve     │
│  └──────────────────────────┘  └────────────────┘   • ingestion_state
│                                                      • ingestion_log
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

**`CveSourceConnector` Interface**
Each data source (NVD, MITRE, vendor RSS) implements this interface:
- `fetchSince(lastSyncTime)` → List of raw CVE records
- Connector decides how to handle incremental vs. full fetches
- Encapsulates source-specific API contracts and pagination

**`CveNormalizerService`**
- Takes raw CVEs from any source and merges them into one canonical record per CVE ID
- **Authority hierarchy**: NVD/MITRE fields override vendor data for core attributes (description, CVSS v3 score, publish date)
- **Conflict resolution**: if multiple sources provide conflicting CVSS scores, the highest is kept with source attribution
- Upserts by CVE ID (deterministic — same CVE ID always produces one row)

**`IngestionScheduler` & `@Scheduled`**
- One cron job per source (independent, can run in parallel)
- After fetch, immediately normalizes and persists
- Updates `ingestion_state` with new watermark on success
- Logs every run to `ingestion_log` (for audit, debugging, alerting)

## Data Sources in Detail

| Source | Connector | Method | Frequency | Rate Limit | Notes |
|--------|-----------|--------|-----------|-----------|-------|
| **NVD** | `NvdConnector` | REST API 2.0 | Every 30 min | 5 req/30s (50/30s with API key) | Paginated, incremental via `lastModStartDate`/`EndDate`. [Docs](https://services.nvd.nist.gov/rest/json/cves/2.0) |
| **MITRE (CVE Program)** | `MitreConnector` | GitHub cvelistV5 `deltaLog.json` | Hourly @ :15 | None (GitHub raw.githubusercontent.com) | Public repo, no auth needed. Replaces old MITRE bulk feeds. |
| **Red Hat Advisories** | `VendorAdvisoryConnector` | RSS feed | Every 2h @ :45 | None | URL: `https://access.redhat.com/security/data/metrics/rhsa.rss` |
| **Debian Advisories** | `VendorAdvisoryConnector` | Atom feed | Every 2h @ :45 | None | URL: `https://www.debian.org/security/dsa-long` |
| **Custom Feeds** | `VendorAdvisoryConnector` | RSS/Atom | Configurable | Varies | Add via `ingestion.vendor.feeds` in `application.yml` |

**Adding a new vendor feed:**
No code changes needed for standard RSS/Atom feeds — just add to `application.yml`:
```yaml
ingestion:
  vendor:
    feeds:
      - key: ubuntu
        display-name: Ubuntu Security Notices
        url: https://usn.ubuntu.com/usn/usn-db.json
```

For proprietary APIs (Cisco openVuln, MSRC CVRF), implement a new `CveSourceConnector` subclass.

## Code Structure

```
src/main/java/com/security/cveingestion/
├── CveIngestionServiceApplication.java    # Spring Boot entry point
├── config/
│   ├── CorsConfig.java                    # CORS headers for local dev
│   ├── HttpClientConfig.java              # RestTemplateBuilder + timeouts
│   └── SchedulingConfig.java              # @EnableScheduling
├── connector/
│   ├── CveSourceConnector.java            # Interface
│   ├── impl/
│   │   ├── NvdConnector.java              # NVD API 2.0
│   │   ├── MitreConnector.java            # GitHub cvelistV5
│   │   └── VendorAdvisoryConnector.java   # RSS/Atom parser
│   └── dto/
│       ├── NvdCveDto.java                 # NVD API response DTOs
│       ├── MitreCveDto.java               # MITRE GitHub response DTOs
│       └── RawCveRecord.java              # Normalized internal DTO
├── controller/
│   └── CveController.java                 # REST API endpoints
├── entity/
│   ├── Cve.java                           # @Entity, mapped to `cve` table
│   ├── IngestionState.java                # Watermark per source
│   └── IngestionLog.java                  # Audit trail
├── repository/
│   ├── CveRepository.java                 # Spring Data JPA (CRUD, custom queries)
│   ├── IngestionStateRepository.java      # Fetch/update watermarks
│   └── IngestionLogRepository.java        # Write audit logs
├── scheduler/
│   └── IngestionScheduler.java            # @Scheduled methods, one per source
├── service/
│   ├── CveIngestionService.java           # Orchestration: fetch→normalize→save
│   ├── CveNormalizerService.java          # Conflict resolution, upsert logic
│   └── MetricsService.java                # Micrometer counters/timers
└── utils/
    └── CveNormalizationUtil.java          # CVSS parsing, severity mapping, etc.
```

## Running Locally

### Prerequisites
- Java 25+
- Docker & Docker Compose (or standalone PostgreSQL 16+)
- Optional: NVD API key (set `NVD_API_KEY` env var for higher rate limit)

### Quickstart with Docker Compose

```bash
cd services/ingestion-service
docker compose up --build
```

This:
1. Starts PostgreSQL on `localhost:5432`
2. Applies all Flyway migrations (creates `cve`, `ingestion_state`, `ingestion_log` tables)
3. Starts ingestion service on `http://localhost:8080`
4. Automatically kicks off the first scheduled runs per `application.yml` cron expressions

Check the logs:
```bash
docker compose logs -f ingestion-service
```

### Running Standalone (no Docker)

Requires PostgreSQL running separately:
```bash
# 1. Create the database
psql -U postgres -c "CREATE DATABASE cve_db;"

# 2. Build and run
mvn clean package
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=postgres java -jar target/*.jar
```

### Manually Trigger a Sync

From dashboard or via curl:
```bash
# Trigger NVD ingestion
curl -X POST http://localhost:8080/api/ingestion/trigger/NVD

# Trigger MITRE ingestion
curl -X POST http://localhost:8080/api/ingestion/trigger/MITRE

# Trigger all vendor feeds
curl -X POST http://localhost:8080/api/ingestion/trigger/VENDOR
```

Each returns immediately (async execution); check the logs or `GET /api/ingestion/logs/{source}` for status.

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` | `localhost` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `cve_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `NVD_API_KEY` | (empty) | Optional NVD API key (increases rate limit 5→50 req/30s) |
| `SPRING_PROFILES_ACTIVE` | (empty) | Profile (e.g., `prod` for production settings) |

### application.yml

All three sources are independently configurable:

```yaml
ingestion:
  nvd:
    enabled: true
    cron: "0 */30 * * * *"           # Every 30 minutes
    base-url: https://services.nvd.nist.gov/rest/json/cves/2.0
    api-key: ${NVD_API_KEY:}         # Optional
    results-per-page: 200            # Pagination size
    request-delay-ms: 6000           # Delay between paginated requests (respect rate limit)
    initial-backfill-days: 7         # Days to backfill on first run

  mitre:
    enabled: true
    cron: "0 15 */1 * * *"           # Every hour at :15
    delta-log-url: https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/deltaLog.json
    raw-content-base-url: https://raw.githubusercontent.com/CVEProject/cvelistV5/main/
    max-records-per-run: 500         # Avoid processing the entire delta log each time

  vendor:
    enabled: true
    cron: "0 45 */2 * * *"           # Every 2 hours at :45
    feeds:
      - key: redhat
        display-name: Red Hat Security Advisories
        url: https://access.redhat.com/security/data/metrics/rhsa.rss
      - key: debian
        display-name: Debian Security Advisories
        url: https://www.debian.org/security/dsa-long
```

**Disable a source** by setting `enabled: false` or adjusting its `cron` schedule.

## API Endpoints

### CVE Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cves/{cveId}` | Fetch one normalized CVE (e.g., `CVE-2024-12345`) |
| `GET` | `/api/cves?page=0&size=20&severity=CRITICAL` | Paginated CVE listing; filter by `severity`, `vendor`, or `published` date |
| `GET` | `/api/cves/search?q=kernel` | Full-text search (if enabled; searches `description` and `vendor_product`) |

**Example: Get CRITICAL CVEs**
```bash
curl "http://localhost:8080/api/cves?severity=CRITICAL&page=0&size=10" | jq
```

### Ingestion Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingestion/trigger/NVD` | Manually trigger NVD ingestion (async) |
| `POST` | `/api/ingestion/trigger/MITRE` | Manually trigger MITRE ingestion (async) |
| `POST` | `/api/ingestion/trigger/VENDOR` | Manually trigger all vendor feeds (async) |
| `GET` | `/api/ingestion/logs/{source}` | Audit trail: last 20 runs for a source (status, counts, errors) |

**Example: View NVD ingestion history**
```bash
curl http://localhost:8080/api/ingestion/logs/NVD | jq '.[] | {timestamp, fetched, inserted, updated, error}'
```

### Health & Metrics

| Endpoint | Description |
|----------|-------------|
| `GET` | `/actuator/health` | Liveness probe (Spring Boot health check) |
| `GET` | `/actuator/metrics` | List all available metrics |
| `GET` | `/actuator/metrics/ingestion.cves.fetched` | Counter: total CVEs fetched |
| `GET` | `/actuator/metrics/ingestion.cves.inserted` | Counter: total CVEs inserted |
| `GET` | `/actuator/metrics/ingestion.cves.updated` | Counter: total CVEs updated |
| `GET` | `/actuator/metrics/ingestion.run.duration` | Histogram: ingestion run duration (seconds) |

## Database Schema

### Tables (defined in Flyway migrations)

**`cve`** (V1__init_schema.sql)
- `cve_id` (PK): e.g., `CVE-2024-12345`
- `description`: normalized description (authoritative source: NVD > MITRE > vendor)
- `cvss_v3_score`, `cvss_v3_vector`: CVSS v3 (authoritative: NVD > MITRE)
- `cvss_v2_score`, `cvss_v2_vector`: CVSS v2 (fallback if v3 not available)
- `severity`: Computed from CVSS (LOW, MEDIUM, HIGH, CRITICAL)
- `vendor`, `product`: Affected software (from vendor feeds or CVE description parsing)
- `publish_date`, `update_date`: Timeline
- `raw_data`: JSONB blob of original payload (for traceability; one source wins per sync)
- `ingested_at`: Timestamp of last successful normalization
- `source_attribution`: JSON listing which source provided which field

**`ingestion_state`** (V1__init_schema.sql)
- `source` (PK): `NVD`, `MITRE`, or `VENDOR_<feedkey>`
- `last_sync_time`: Watermark for next incremental fetch
- `last_success_at`: Timestamp of last successful run
- `last_error`: Error message if last run failed (null if success)

**`ingestion_log`** (V1__init_schema.sql)
- `id` (PK, auto-incremented)
- `source`: Which source ran
- `run_started_at`, `run_completed_at`: Execution window
- `status`: `IN_PROGRESS`, `SUCCESS`, `FAILED`
- `fetched_count`, `inserted_count`, `updated_count`, `error_count`: Tallies
- `error_message`: If status = `FAILED`, the root cause
- `next_watermark`: Timestamp used for next run's `fetchSince()`

## Testing

### Unit Tests

Run all tests:
```bash
mvn test
```

**Test coverage:**
- `NvdConnectorTest`: NVD API pagination, response parsing, date filtering
- `MitreConnectorTest`: GitHub deltaLog parsing, concurrent downloads
- `VendorAdvisoryConnectorTest`: RSS/Atom parsing, edge cases (missing fields, malformed XML)
- `CveNormalizerServiceTest`: Conflict resolution (NVD beats MITRE beats vendor), upsert idempotence
- `CveIngestionServiceTest`: Full orchestration (fetch → normalize → save), watermark updates
- `CveControllerTest`: REST API validation, pagination bounds, filter parameters

### Integration Tests (with Testcontainers)

PostgreSQL container is spun up automatically (no external DB needed):
```bash
mvn verify
```

Tests verify:
- Flyway migrations applied correctly
- Data persisted correctly per entity relationships
- Concurrent ingestion from multiple sources doesn't corrupt data
- Watermarks advance correctly on success/failure

## Monitoring & Observability

### Metrics Exposed (Prometheus format)

- `ingestion.run.duration.seconds` — histogram of ingestion run times per source
- `ingestion.cves.fetched.total` — counter: cumulative CVEs fetched from each source
- `ingestion.cves.inserted.total` — counter: cumulative new CVEs inserted
- `ingestion.cves.updated.total` — counter: cumulative existing CVEs updated
- `ingestion.cves.normalized.total` — counter: cumulative normalization operations

**Scrape endpoint:** `http://localhost:8080/actuator/prometheus`

In Kubernetes, Prometheus scrapes this endpoint automatically (see `k8s/ingestion-service/deployment.yaml`).

### Logging

- **Log level**: Controlled by `logging.level` in `application.yml` (default: INFO)
- **Format**: Spring Boot default (timestamp, level, logger name, message)
- **Structured logging**: JSON logging can be enabled in production for easier parsing

Example log output:
```
2024-08-26 14:35:22 INFO [ingestion-service] com.security.cveingestion.scheduler.IngestionScheduler - Starting NVD ingestion
2024-08-26 14:35:25 INFO [ingestion-service] com.security.cveingestion.connector.NvdConnector - Fetched 150 CVEs from NVD
2024-08-26 14:35:26 INFO [ingestion-service] com.security.cveingestion.service.CveNormalizerService - Normalized 150 records
2024-08-26 14:35:27 INFO [ingestion-service] com.security.cveingestion.service.CveIngestionService - Upserted 143 CVEs (inserted: 50, updated: 93)
2024-08-26 14:35:27 INFO [ingestion-service] com.security.cveingestion.scheduler.IngestionScheduler - NVD ingestion completed in 5.2s
```

## Troubleshooting

### "Rate limited by NVD"
- Set `NVD_API_KEY` environment variable (increases limit from 5 to 50 requests/30s)
- Adjust `ingestion.nvd.request-delay-ms` (default: 6000ms; increase if still hitting limits)

### "No new CVEs ingested"
- Check `GET /api/ingestion/logs/NVD` to see if ingestion ran and what watermark was used
- If watermark is old, manually reset: update `ingestion_state` table `last_sync_time` to a recent date and trigger again

### "Connection refused on PostgreSQL"
- Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`
- Ensure PostgreSQL is running: `docker ps` should show a `postgres` container
- Try connecting directly: `psql -h localhost -U postgres -d cve_db`

### "Flyway migration error"
- Migrations are versioned (V1, V2, etc.) and must be applied in order
- If a migration has been applied incorrectly, see `flyway_schema_history` table
- Do NOT edit already-applied migrations; create a new one instead

## What's Next (Phase 2+)

- **Vendor-specific APIs**: Cisco openVuln, MSRC CVRF, Ubuntu CVE Tracker (structured JSON/XML, not RSS)
- **EPSS integration**: Fetch Exploit Prediction Scoring System scores and Known Exploited Vulnerabilities (KEV) data
- **Full-text search**: Elasticsearch backend for semantic search over descriptions
- **Webhook alerting**: POST to external systems (e.g., Slack, email) when critical CVEs arrive
- **API authentication**: Before exposing beyond `localhost:8080`

## Contributing

See main platform README for coding guidelines, testing requirements, and commit message format.

