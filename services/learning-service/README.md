# Continuous Learning (Phase 8)

Node.js/Express service that captures structured feedback on the pipeline's
judgments and remediation outcomes, aggregates those signals, and produces
explainable calibration reports with plain-language recommendations. These
reports inform human decisions (weights, asset profiles, prompts) — the
service never automatically changes other services' configuration.

## Goals and responsibilities

- Capture analyst feedback on AI analysis and risk scores (1-5 ratings).
- Record remediation outcomes (ticket resolved, time-to-resolution, SLA met).
- Aggregate data into per-risk-level and per-prompt-version calibration reports.
- Emit clear recommendations when a metric crosses configured thresholds.

## Schema

All new tables for Phase 8 are defined in the ingestion-service's Flyway
migrations (`V5__continuous_learning.sql`) as this repository is the single
schema authority for the platform:

- `feedback` — stores analyst-submitted ratings and comments
- `calibration_report` — snapshot report with aggregated stats and recommendations
- `remediation_action` (existing) gained `resolved_at`, `time_to_resolution_hours`, and `met_sla` columns
- `cve_analysis` (existing) gained `prompt_version` to enable per-prompt reporting

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/feedback` | Submit feedback: `{ "cveId", "feedbackType": "ANALYSIS_ACCURACY" | "RISK_ACCURACY" | "REMEDIATION_OUTCOME", "rating": 1-5, "comment", "submittedBy" }` |
| `GET` | `/api/feedback/cve/:cveId` | All feedback for one CVE |
| `GET` | `/api/feedback?type=RISK_ACCURACY&page=0&size=20` | Paginated listing, optionally filtered by type |
| `POST` | `/api/learning/report/trigger` | Regenerate the calibration report now (async) |
| `GET` | `/api/learning/report/latest` | The most recent report |
| `GET` | `/api/learning/report?limit=20` | Report history |

Examples:

```bash
# Submit feedback
curl -X POST http://localhost:3002/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"cveId":"CVE-2024-12345","feedbackType":"ANALYSIS_ACCURACY","rating":4,"comment":"Good summary","submittedBy":"alice@example.com"}'

# Get latest report
curl http://localhost:3002/api/learning/report/latest | jq
```

## Running locally

Prerequisites: Node.js 20+, PostgreSQL (ingestion-service migrations must have run so required tables exist).

```bash
cd services/learning-service
npm install
cp .env.example .env
npm start
```

This service expects shared schema tables present (created by the ingestion
service's Flyway migrations). With an empty DB it will still run but reports
will be empty.

## Configuration

Key environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | Express port (default: 3002) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `CALIBRATION_CRON` | Cron for periodic report generation (default: daily @ 03:00) |
| `CALIBRATION_MIN_SAMPLE_SIZE` | Minimum samples before recommending a change (default: 5) |
| `CALIBRATION_RATING_THRESHOLD` | Avg rating below which to flag an item |
| `CALIBRATION_SLA_THRESHOLD` | SLA-met fraction below which to flag remediation performance |

## Code structure

```
src/
├── index.js                 # Express app + scheduling
├── routes/
│   ├── feedback.js          # POST /api/feedback, GET routes
│   └── report.js            # /api/learning/report endpoints
├── services/
│   ├── feedbackService.js   # Validation + persistence
│   └── calibrationService.js# Aggregation + rule evaluation
├── repository/
│   ├── feedbackRepository.js
│   └── reportRepository.js
├── scheduler/
│   └── reportScheduler.js   # node-cron job
└── utils/
    └── metrics.js           # Prometheus metrics (prom-client)
```

## Testing

```bash
npm test
```

Important tests:
- `calibrationService.test.js`: verifies recommendation rules and sample-size gating
- `feedbackRepository.test.js`: input validation (rating range, types)

## Monitoring & Metrics

Exposes Prometheus metrics via `/metrics` (prom-client). Useful counters include:

- `learning.feedback.submitted.total` — counter of feedback submissions
- `learning.report.generated.total` — counter of generated calibration reports

Health endpoint: `GET /health` (used for Kubernetes probes).

## Troubleshooting

- "No reports generated": ensure ingestion-service migrations (V5) have run and `cve_analysis` + `remediation_action` tables exist.
- "Feedback not stored": check DB connection env vars and service logs for errors; validate payload shape against API docs.

## What's next

- Visualizations: Grafana panels and dashboard integration for trend charts
- Per-user authorization for submitting feedback and triggering reports
- More rule types (e.g., per-vendor analysis) and richer recommendation text

