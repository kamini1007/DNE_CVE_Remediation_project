# AI Analysis Service (Phase 3)

Node.js/Express service that uses **AWS Bedrock** to turn each ingested CVE into:
- a plain-language simplified description
- an exploitability level + rationale
- a potential-impact assessment
- ordered, actionable remediation recommendations

Results are written to the `cve_analysis` table for risk-engine-service (Phase 4)
and the dashboard (Phase 6) to consume.

## How it fits with the other services

- **Schema ownership**: `cve_analysis` is defined in **ingestion-service's**
  Flyway migrations (`V2__create_cve_analysis_table.sql`), not here. This
  service never runs a migration itself - there's exactly one schema
  authority for the whole database. Practical implication: run
  ingestion-service at least once (so `cve` and `cve_analysis` exist) before
  this service's pods start.
- **Bedrock access**: via IRSA - the `ai-analysis-service` Kubernetes
  ServiceAccount is annotated with an IAM role (Terraform: `iam-bedrock.tf`)
  scoped to `bedrock:InvokeModel` on exactly the configured model IDs. No AWS
  keys appear anywhere in this service's config.
- **Selection logic** (`src/repository/cveRepository.js`): picks CVEs that
  are unanalyzed, previously failed, or updated since their last analysis -
  highest CVSS score first, so the most severe/impactful CVEs get analyzed
  first when Bedrock throughput is the bottleneck.

## Running locally

```bash
npm install
cp .env.example .env   # adjust DB_* to point at your local ingestion-service Postgres
npm start
```

Requires `cve` (and `cve_analysis`) to already exist - i.e. ingestion-service's
Flyway migrations must have run against the target database first.

For Bedrock calls to work locally against real AWS, your AWS CLI credentials
need `bedrock:InvokeModel` on the configured model IDs (`aws sso login` /
profile with that permission); in-cluster this is handled by IRSA instead.

**Running fully offline, no AWS account at all:** set `BEDROCK_ENDPOINT_URL`
to point at `infra/localstack/mock-bedrock` (a small local stand-in for
Bedrock's HTTP contract - not real AI, just enough for full pipeline testing)
instead of real AWS:
```bash
BEDROCK_ENDPOINT_URL=http://localhost:4010 npm start
```
Every field in the resulting analysis will be prefixed `[mock-bedrock]` so it
can never be mistaken for a real assessment. Full offline setup (Postgres +
all backend services + this mock, wired together) is in
`docs/localstack-guide.md` at the repo root.

## Testing

```bash
npm test
```

Covers the response parser (malformed/fenced JSON, invalid enum values),
the concurrency limiter, and the `/health` endpoint. Bedrock calls and the DB
are not exercised in tests - no network/DB access is assumed in CI.

## API

| Endpoint | Description |
|---|---|
| `POST /api/analysis/trigger` | Manually trigger a batch run (async, returns immediately). Optional body: `{ "batchSize": 10 }`. |
| `POST /api/analysis/cve/:cveId` | Synchronously analyze one CVE right now (e.g. "analyze this" from the dashboard). |
| `GET /api/analysis/cve/:cveId` | Fetch the stored analysis for one CVE. |
| `GET /api/analysis?status=SUCCESS&page=0&size=20` | Paginated listing, optionally filtered by status. |
| `GET /health` | Liveness/readiness probe target. |

## Configuration

All via environment variables - see `.env.example`. Key ones:

| Variable | Purpose |
|---|---|
| `BEDROCK_PRIMARY_MODEL_ID` / `BEDROCK_FALLBACK_MODEL_IDS` | Model tried first, then fallbacks in order on throttling/unavailability. |
| `BEDROCK_ENDPOINT_URL` | Optional - redirect the Bedrock client at a local endpoint (mock-bedrock, or LocalStack's Bedrock emulation if you have Pro) instead of real AWS. Unset in production. |
| `ANALYSIS_CRON` | How often the scheduled batch job runs. |
| `ANALYSIS_BATCH_SIZE` | Max CVEs pulled per run. |
| `ANALYSIS_CONCURRENCY` | Max concurrent Bedrock calls in flight. |

## What's next (Phase 5)

remediation-service will consume risk-engine-service's prioritized list to
drive patch recommendations, remediation playbooks, and Jira ticket creation.
