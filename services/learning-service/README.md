# Continuous Learning (Phase 8)

Node.js/Express service that captures structured feedback on the pipeline's
judgments and turns it, along with real remediation outcomes, into
rule-based, explainable calibration reports.

## Why this isn't "auto-retraining"

There's no trained model anywhere in this pipeline. Risk scoring
(risk-engine-service) is a weighted formula over five factors; CVE analysis
(ai-analysis-service) is a call to a foundation model via Bedrock, not
something this team fine-tunes. So "continuous learning" for this system
can't honestly mean an autonomous feedback loop that retrains anything -
there's nothing to retrain.

What it can honestly mean, and what this service does:

1. **Capture ground truth.** Analysts rate a CVE's AI analysis or risk score
   (1-5, `POST /api/feedback`). Separately, `remediation-service` now polls
   Jira and records whether each ticket was actually resolved, and whether
   that happened within the playbook's own SLA window
   (`remediation_action.resolved_at` / `met_sla`).
2. **Aggregate it.** Per risk level: average feedback rating, and the actual
   SLA-met rate from resolved tickets. Per AI prompt version
   (`cve_analysis.prompt_version`, stamped by ai-analysis-service on every
   analysis): average feedback rating.
3. **Generate plain-language recommendations - never apply them.** If a risk
   level or prompt version is rated poorly by enough people
   (`CALIBRATION_MIN_SAMPLE_SIZE`, default 5 - a small sample shouldn't drive
   a conclusion), a recommendation is added pointing at exactly what to
   review (`risk-engine.weights`, an asset profile, or `SYSTEM_PROMPT`). No
   code path in this service writes to another service's configuration.
   Applying a suggested change is always a deliberate, separate, human action.

## Schema

`feedback` and `calibration_report` are new tables; `remediation_action`
gained `resolved_at`/`time_to_resolution_hours`/`met_sla` columns; `cve_analysis`
gained `prompt_version`. All defined in ingestion-service's Flyway migrations
(`V5__continuous_learning.sql`) - same single-schema-authority pattern as
every other table in this platform.

## Running locally

```bash
npm install
cp .env.example .env
npm start
```

Requires the Phase 8 schema to exist (ingestion-service's migrations run)
and, ideally, some feedback/remediation-outcome data - an empty database
produces an empty-but-valid report (every stat `null`/`0`, no recommendations).

## Testing

```bash
npm test
```

`calibrationService.test.js` is the important one: it verifies each
recommendation rule fires and doesn't fire at the right thresholds
(including that a poor rating below the minimum sample size is correctly
*not* flagged), and includes an explicit test asserting the service only
ever calls `saveReport` - never anything that would mutate another service's
configuration. `feedbackRepository.test.js` covers input validation
(feedback type, rating range) without touching a real database.

## API

| Endpoint | Description |
|---|---|
| `POST /api/feedback` | Submit feedback: `{ "cveId", "feedbackType": "ANALYSIS_ACCURACY" \| "RISK_ACCURACY" \| "REMEDIATION_OUTCOME", "rating": 1-5, "comment", "submittedBy" }`. |
| `GET /api/feedback/cve/:cveId` | All feedback submitted for one CVE. |
| `GET /api/feedback?type=RISK_ACCURACY&page=0&size=20` | Paginated listing, optionally filtered by type. |
| `POST /api/learning/report/trigger` | Manually regenerate the calibration report now (async). |
| `GET /api/learning/report/latest` | The most recent report. |
| `GET /api/learning/report?limit=20` | Report history. |

## Configuration

| Variable | Purpose |
|---|---|
| `CALIBRATION_CRON` | How often a report is auto-generated (default: daily at 03:00). |
| `CALIBRATION_MIN_SAMPLE_SIZE` | Minimum data points before a stat becomes a recommendation. |
| `CALIBRATION_RATING_THRESHOLD` | Average rating (out of 5) below which something gets flagged. |
| `CALIBRATION_SLA_THRESHOLD` | SLA-met fraction below which a risk level's remediation performance gets flagged. |

## What's next

This closes the planned 8-phase roadmap. Natural follow-ons, not built here:
Alertmanager routing for the pipeline alerts (Phase 7 called this out too),
Grafana dashboards visualizing calibration trends over time, and eventually
per-user authorization so feedback submission and report triggering aren't
both available to everyone who can reach the dashboard.
