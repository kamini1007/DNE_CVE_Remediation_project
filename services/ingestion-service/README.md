# CVE Ingestion Service - Phase 1

Spring Boot service that ingests CVE data from **NVD**, **MITRE (CVE Program)**,
and **vendor security advisory feeds**, normalizes it into a common schema, and
stores it in PostgreSQL on independently-scheduled cron jobs.

## Architecture

```
NvdConnector ────┐
MitreConnector ──┼──▶ RawCveRecord ──▶ CveNormalizerService ──▶ Postgres (cve table)
VendorAdvisory ──┘         (upsert, multi-source merge)

IngestionScheduler (@Scheduled, one cron per source)
        │
        ▼
CveIngestionService (fetch → normalize → save; tracks ingestion_state + ingestion_log)
```

- **`CveSourceConnector`** — interface every source implements (`fetchSince(lastSyncTime)`).
- **`CveNormalizerService`** — upserts by `cve_id`. NVD/MITRE are treated as
  authoritative for core fields (description, CVSS, status); vendor feeds only
  fill in gaps and contribute reference links, unless nothing else exists yet.
- **`ingestion_state`** — one row per source, storing the last successful sync
  watermark so each run only pulls what changed since then.
- **`ingestion_log`** — audit trail of every run (fetched/inserted/updated counts,
  errors) for monitoring.

## Data sources

| Source | Method | Notes |
|---|---|---|
| **NVD** | REST API 2.0 (`services.nvd.nist.gov/rest/json/cves/2.0`) | Paginated, incremental via `lastModStartDate/EndDate`. Rate-limited (5 req/30s, 50/30s with an API key — set `NVD_API_KEY`). |
| **MITRE** | `cvelistV5` GitHub repo `deltaLog.json` | MITRE's old bulk feeds are retired; the CVE Program (cve.org) now maintains records in this public, no-auth GitHub repo. If you later get CVE Services API credentials, swap in an authenticated connector for lower latency. |
| **Vendor advisories** | Generic RSS/Atom polling (`VendorAdvisoryConnector`) | Ships with Red Hat + Debian feeds configured in `application.yml`. Add more by adding entries under `ingestion.vendor.feeds` — no code change needed for standard RSS/Atom feeds. Vendors with bespoke JSON/CSAF APIs (Cisco openVuln, MSRC CVRF) need their own connector class in a later phase. |

## Running locally

```bash
docker compose up --build
```

This starts Postgres (with the schema applied via Flyway on app boot) and the
ingestion service on `http://localhost:8080`.

Optional: set an NVD API key for a higher rate limit:
```bash
NVD_API_KEY=your-key docker compose up --build
```

## Configuration

All source behavior is tunable in `application.yml` under `ingestion.*` —
enable/disable a source, change its cron schedule, adjust batch sizes, or add
vendor feeds, without touching code:

```yaml
ingestion:
  nvd:
    enabled: true
    cron: "0 */30 * * * *"
  mitre:
    enabled: true
    cron: "0 15 */1 * * *"
  vendor:
    enabled: true
    cron: "0 45 */2 * * *"
    feeds:
      - key: redhat
        display-name: Red Hat Security Advisories
        url: https://access.redhat.com/security/data/metrics/rhsa.rss
```

## API

| Endpoint | Description |
|---|---|
| `POST /api/ingestion/trigger/{NVD\|MITRE\|VENDOR}` | Manually trigger a run for one source (runs async). |
| `GET /api/ingestion/logs/{source}` | Last 20 ingestion runs for a source (status, counts, errors). |
| `GET /api/cves/{cveId}` | Fetch one normalized CVE record. |
| `GET /api/cves?severity=CRITICAL&page=0&size=20` | Paginated CVE listing, filterable by `severity` or `vendor`. |

## Database schema

See `src/main/resources/db/migration/V1__init_schema.sql`:
- `cve` — normalized record, one row per CVE ID, `raw_data` JSONB keeps the last
  raw payload for traceability.
- `ingestion_state` — sync watermark per source.
- `ingestion_log` — run history/audit trail.

## What's next (Phase 2+ candidates)

- Dedicated connectors for vendors with structured APIs (Cisco openVuln, MSRC CVRF/CSAF).
- Full-text/semantic search over `description`.
- Enrichment: EPSS scores, KEV (Known Exploited Vulnerabilities) flagging.
- Alerting/webhooks on new critical CVEs matching a watched product list.
- Auth on the REST API before exposing beyond localhost.
