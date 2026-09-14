# AI Analysis Service - Phase 3

Node.js/Express microservice that enriches ingested CVE data with AI-generated insights using **AWS Bedrock**. Transforms raw vulnerability descriptions into actionable intelligence: plain-language summaries, exploitability assessments, impact projections, and prioritized remediation steps.

Results are written to the `cve_analysis` table and consumed by:
- **Risk Engine Service** (Phase 4) — exploitability factor in risk scoring
- **Remediation Service** (Phase 5) — AI-generated remediation recommendations become playbook steps
- **Dashboard** (Phase 6) — AI insights displayed in CVE detail panels

## Architecture

### Component Diagram

```
┌──────────────────────────────────────────────────────┐
│          AI Analysis Service                         │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Selection Logic                               │ │
│  │  (CveRepository.getCvesToAnalyze)              │ │
│  │                                                │ │
│  │  Prioritization: by CVSS (descending)          │ │
│  │  Include: unanalyzed + failed + updated CVEs   │ │
│  └────────────────────────────────────────────────┘ │
│                        │                            │
│                        ▼                            │
│  ┌────────────────────────────────────────────────┐ │
│  │  Bedrock Integration (aws-sdk/client-bedrock) │ │
│  │                                                │ │
│  │  Primary:   Claude 3.5 Sonnet (latest)         │ │
│  │  Fallback:  Claude 3 Haiku (if throttled)      │ │
│  │  Endpoint:  AWS Bedrock OR LocalStack mock    │ │
│  │  Concurrency: 3 parallel calls (configurable)  │ │
│  └────────────────────────────────────────────────┘ │
│                        │                            │
│                        ▼                            │
│  ┌────────────────────────────────────────────────┐ │
│  │  Response Parser                               │ │
│  │  • Extract fenced JSON from markdown           │ │
│  │  • Validate enum values (exploitability, etc)  │ │
│  │  • Handle malformed responses gracefully       │ │
│  └────────────────────────────────────────────────┘ │
│                        │                            │
│                        ▼                            │
│  ┌────────────────────────────────────────────────┐ │
│  │  Persistence (CveAnalysisRepository)           │ │
│  │  Write to `cve_analysis` table:                │ │
│  │  • status: SUCCESS / FAILED / IN_PROGRESS      │ │
│  │  • simplified_description                      │ │
│  │  • exploitability_level                        │ │
│  │  • impact_assessment                           │ │
│  │  • remediation_steps (JSON array)              │ │
│  │  • prompt_version (for learning feedback)      │ │
│  │  • error_message (if status = FAILED)          │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
          ↓
   PostgreSQL (shared schema)
   Table: cve_analysis
```

### Key Concepts

**`CveRepository.getCvesToAnalyze(batchSize)`**
Selects CVEs ready for analysis, in priority order:
1. **Unanalyzed**: no row in `cve_analysis`
2. **Failed**: `status = FAILED` and last attempt > 1 hour ago (retry failed analyses)
3. **Updated**: `cve.update_date > cve_analysis.analyzed_at` (re-analyze if CVE data changed)
4. **Ordered by**: `cve.cvss_v3_score DESC` (highest severity first; drives remediation urgency)

**Prompt Strategy**
Each system prompt is versioned (stored in `cve_analysis.prompt_version`). Changing the prompt:
1. Increment the version in `src/config/bedrock.js`
2. Existing analyses keep old version; new analyses use new version
3. Learning service uses prompt_version to aggregate feedback per generation method

**Concurrency Control**
- Default: 3 concurrent Bedrock calls (configurable via `ANALYSIS_CONCURRENCY`)
- Prevents throttling on account with low quota
- Respects Bedrock rate limits (tokens/minute); backoff on 429/503

**Error Handling**
- Transient errors (network, throttling): logged + CVE retried next batch
- Permanent errors (malformed CVE, bad model ID): marked `FAILED`, won't retry automatically
- Mock errors (LocalStack, bad JSON): clear error message in `cve_analysis.error_message`

## Bedrock Integration

### Model Selection

| Model | Use Case | Availability | Cost (per 1M tokens) |
|-------|----------|--------------|---------------------|
| **Claude 3.5 Sonnet** | Primary (best accuracy/latency) | `anthropic.claude-3-5-sonnet-20241022-v2:0` | ~$3 input, ~$15 output |
| **Claude 3 Haiku** | Fallback (if Sonnet throttled) | `anthropic.claude-3-haiku-20240307-v1:0` | ~$0.25 input, ~$1.25 output |
| **Anthropic Claude 3** | Legacy (if needed) | `anthropic.claude-3-opus-20240229-v1:0` | ~$15 input, ~$75 output |

### Prompt Engineering

The system prompt is defined in `src/prompts/cveAnalysisPrompt.js`. Current version:

```
Analyze this CVE vulnerability in a structured manner:

1. Simplified Description (2-3 sentences, no jargon)
2. Exploitability Level (CRITICAL / HIGH / MEDIUM / LOW)
3. Potential Impact Assessment
4. Ordered Remediation Steps (5-7 steps, actionable)

Return valid JSON only, wrapped in markdown fences (```json ... ```).
Respond with exactly this structure:
{
  "simplifiedDescription": "...",
  "exploitabilityLevel": "CRITICAL|HIGH|MEDIUM|LOW",
  "impactAssessment": "...",
  "remediationSteps": [
    { "step": 1, "description": "...", "effort": "LOW|MEDIUM|HIGH" },
    ...
  ]
}
```

The prompt is stamped as `prompt_version` on every analysis result, enabling:
- Per-version feedback aggregation (learning service)
- A/B testing of different prompts
- Easy rollback if a new prompt regresses quality

### AWS Authentication (Production)

Uses **IRSA (IAM Roles for Service Accounts)** in Kubernetes:
1. Service account `ai-analysis-service` is annotated with IAM role ARN
2. Pod's IRSA webhook injects AWS credentials via `IRSA_ROLE_ARN` / OIDC
3. Service assumes that role (no AWS keys in config)
4. IAM policy grants `bedrock:InvokeModel` on specific model IDs

**No AWS credentials appear anywhere in this service's code or config files.**

Local development uses your AWS CLI credentials (via `aws sso login` or `~/.aws/credentials`).

## Code Structure

```
src/
├── index.js                       # Express app entry, scheduling setup
├── app.js                         # Express server (routes, middleware, CORS)
├── bedrock/
│   ├── bedrockClient.js           # AWS SDK client, retry logic, concurrency control
│   └── responseParser.js          # Extract/validate JSON from markdown responses
├── config/
│   ├── bedrock.js                 # Model IDs, prompt version, max tokens
│   └── database.js                # PostgreSQL connection pool
├── db/
│   ├── init.js                    # Schema validation (cve_analysis table must exist)
│   └── migrate.js                 # (empty — schema owned by ingestion-service)
├── prompts/
│   └── cveAnalysisPrompt.js        # System prompt template + version
├── repository/
│   ├── cveRepository.js           # Query unanalyzed/failed/updated CVEs
│   ├── analysisRepository.js      # Persist analysis results
│   └── queryBuilder.js            # SQL construction (ORDER BY, LIMIT, date filtering)
├── routes/
│   ├── analysis.js                # POST /api/analysis/trigger, POST /api/analysis/cve/:cveId, etc.
│   └── health.js                  # GET /health
├── scheduler/
│   ├── analysisScheduler.js       # node-cron job, calls analysisService
│   └── scheduleConfig.js          # Cron expression validation
├── services/
│   ├── analysisService.js         # Orchestration: fetch batch → analyze → persist
│   └── batchProcessor.js          # Handles concurrency, error recovery
├── metrics/
│   └── prometheus.js              # prom-client counters, histograms
└── utils/
    ├── logger.js                  # Structured logging
    └── errors.js                  # Custom error classes
```

## Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ running with `cve` and `cve_analysis` tables (ingestion-service must have run)
- AWS CLI configured with `bedrock:InvokeModel` permissions OR LocalStack mock

### Setup

1. **Install dependencies**
```bash
npm install
```

2. **Copy .env.example to .env and adjust**
```bash
cp .env.example .env
```

Update if needed:
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cve_db
DB_USER=postgres
DB_PASSWORD=postgres
AWS_REGION=us-east-1
BEDROCK_PRIMARY_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_FALLBACK_MODEL_IDS=anthropic.claude-3-haiku-20240307-v1:0
ANALYSIS_CRON=*/15 * * * *        # Run every 15 minutes
ANALYSIS_BATCH_SIZE=25             # Analyze 25 CVEs per run
ANALYSIS_CONCURRENCY=3             # Up to 3 parallel Bedrock calls
```

3. **Start the service**
```bash
npm start
```

The service will:
- Connect to PostgreSQL and validate schema
- Kick off the first scheduled batch analysis at next cron boundary
- Start listening on `http://localhost:3000`

### Running with Real AWS Bedrock

Requires AWS credentials configured:
```bash
aws sso login --profile your-profile   # or use IAM user credentials
export AWS_PROFILE=your-profile
npm start
```

Check logs for successful Bedrock invocations:
```
[ai-analysis-service] INFO Bedrock invoke_model_with_response_stream completed for CVE-2024-12345 (502 ms)
```

### Running Fully Offline (Mock Bedrock)

If you have no AWS account or want to test without spending money:

1. **Start mock-bedrock** (in another terminal)
```bash
cd infra/localstack/mock-bedrock
npm install
npm start     # starts on http://localhost:4010
```

2. **Point ai-analysis-service at mock-bedrock**
```bash
# In your .env
BEDROCK_ENDPOINT_URL=http://localhost:4010
```

3. **Start ai-analysis-service**
```bash
npm start
```

All analysis responses will be prefixed `[mock-bedrock]` so they're never mistaken for real assessments.

**Full offline setup:** See `docs/localstack-guide.md` for entire stack (Postgres + all services + mock Bedrock).

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Express server port |
| `DB_HOST` | `localhost` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `cve_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `BEDROCK_PRIMARY_MODEL_ID` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Model tried first |
| `BEDROCK_FALLBACK_MODEL_IDS` | `anthropic.claude-3-haiku-20240307-v1:0` | Comma-separated fallback models |
| `BEDROCK_MAX_TOKENS` | `1500` | Max response token length |
| `BEDROCK_ENDPOINT_URL` | (unset) | Override Bedrock endpoint (for LocalStack/mock) |
| `ANALYSIS_CRON` | `*/15 * * * *` | Cron expression (every 15 min) |
| `ANALYSIS_BATCH_SIZE` | `25` | CVEs pulled per batch run |
| `ANALYSIS_CONCURRENCY` | `3` | Max parallel Bedrock calls |
| `LOG_LEVEL` | `INFO` | Logging verbosity (DEBUG, INFO, WARN, ERROR) |

## API Endpoints

### Analysis Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analysis/trigger` | Manually trigger a batch run (async, returns immediately). Optional body: `{ "batchSize": 10 }` |
| `POST` | `/api/analysis/cve/:cveId` | Synchronously analyze one CVE right now (e.g., "analyze this" from dashboard) |
| `GET` | `/api/analysis/cve/:cveId` | Fetch the stored analysis for one CVE |
| `GET` | `/api/analysis?status=SUCCESS&page=0&size=20` | Paginated listing, optionally filtered by `status` (SUCCESS, FAILED, IN_PROGRESS) |

### Health & Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness/readiness probe (returns `{ status: "UP" }` if healthy) |
| `GET` | `/metrics` | Prometheus metrics (prom-client format) |

**Example: Get 10 failed analyses**
```bash
curl "http://localhost:3000/api/analysis?status=FAILED&size=10" | jq
```

**Example: Synchronously analyze one CVE**
```bash
curl -X POST http://localhost:3000/api/analysis/cve/CVE-2024-12345 | jq
```

## Database Schema

### `cve_analysis` Table

Defined in ingestion-service's `V2__create_cve_analysis_table.sql`:

| Column | Type | Purpose |
|--------|------|---------|
| `cve_id` | VARCHAR (PK, FK→cve) | CVE identifier |
| `status` | ENUM | `PENDING`, `IN_PROGRESS`, `SUCCESS`, `FAILED` |
| `simplified_description` | TEXT | Plain-language summary (null if status≠SUCCESS) |
| `exploitability_level` | ENUM | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` (null if failed) |
| `impact_assessment` | TEXT | Potential impact (null if failed) |
| `remediation_steps` | JSON | Array of `{ step, description, effort }` objects |
| `prompt_version` | INT | Version of system prompt used |
| `error_message` | TEXT | Reason for failure (null if SUCCESS) |
| `analyzed_at` | TIMESTAMP | When analysis was completed |
| `created_at` | TIMESTAMP | When analysis row was first created |
| `updated_at` | TIMESTAMP | Last update timestamp |

## Testing

### Unit Tests

```bash
npm test
```

Covers:
- **Response Parser**: malformed JSON, fenced markdown, missing fields, invalid enum values
- **Concurrency Control**: queue behavior, backoff on throttling
- **Selection Logic**: unanalyzed vs. failed vs. updated prioritization
- **Health Endpoint**: basic connectivity

Bedrock calls and actual DB operations are **not** exercised in unit tests (no network/DB assumption in CI).

### Integration Tests

For local testing with real PostgreSQL + mock Bedrock:
```bash
# Start dependencies first
docker compose -f docker-compose.yml up -d postgres mock-bedrock
npm test -- --testPathPattern=integration
```

### Manual End-to-End Test

1. Start all services locally:
```bash
docker compose up --build
```

2. Verify PostgreSQL has CVEs:
```bash
curl http://localhost:8080/api/cves | jq '.content | length'
```

3. Manually trigger analysis:
```bash
curl -X POST http://localhost:3000/api/analysis/trigger
```

4. Watch logs:
```bash
docker compose logs -f ai-analysis-service
```

5. Check results:
```bash
curl http://localhost:3000/api/analysis | jq '.content[0]'
```

## Monitoring & Observability

### Metrics Exposed

- `analysis.batch.runs.total` — counter: cumulative batch runs executed
- `analysis.batch.duration.seconds` — histogram: batch run duration
- `analysis.cves.analyzed.total` — counter: total CVEs analyzed (success + failure)
- `analysis.cves.success.total` — counter: successful analyses
- `analysis.cves.failed.total` — counter: failed analyses
- `analysis.bedrock.invoke.duration.seconds` — histogram: Bedrock invocation latency
- `analysis.bedrock.throttled.total` — counter: throttling events (429/503)

**Scrape endpoint:** `http://localhost:3000/metrics`

### Logging

- **Local development**: human-readable to stdout
- **Production** (K8s): structured JSON logs to CloudWatch Logs
- **Log level**: controlled by `LOG_LEVEL` env var

Example log output:
```
[ai-analysis-service] 2024-08-26T14:35:22Z INFO Starting analysis batch (batchSize=25)
[ai-analysis-service] 2024-08-26T14:35:23Z DEBUG Selected 20 CVEs for analysis (highest CVSS first)
[ai-analysis-service] 2024-08-26T14:35:25Z INFO Invoking Bedrock for CVE-2024-12345 (CVSS 9.8)
[ai-analysis-service] 2024-08-26T14:35:26Z INFO Analysis complete for CVE-2024-12345: exploitability=CRITICAL (502 ms)
[ai-analysis-service] 2024-08-26T14:35:27Z ERROR Analysis failed for CVE-2024-54321: Bedrock throttled (429) — will retry next batch
[ai-analysis-service] 2024-08-26T14:35:28Z INFO Batch analysis complete: 19 SUCCESS, 1 FAILED
```

## Troubleshooting

### "Could not connect to the Bedrock API"
- Verify AWS credentials: `aws sts get-caller-identity`
- Ensure `bedrock:InvokeModel` permission on your models
- Check `AWS_REGION` is correct (default: `us-east-1`)

### "Bedrock model not found"
- Verify model ID in `BEDROCK_PRIMARY_MODEL_ID` (use `aws bedrock list-foundation-models`)
- Ensure model is available in your region
- Common mistake: using old model ID (e.g., `claude-3-sonnet-20240229` instead of `claude-3-5-sonnet-20241022-v2`)

### "No CVEs are being analyzed"
- Check `cveRepository.getCvesToAnalyze()` — ensure unanalyzed CVEs exist in `cve` table
- Verify scheduled batch job is running: `curl http://localhost:3000/metrics | grep analysis.batch`
- Check logs: `docker compose logs ai-analysis-service`

### "All analyses are marked FAILED"
- Check error message in `cve_analysis.error_message`
- If "malformed response": prompt may be returning invalid JSON (tweak prompt in `src/prompts/cveAnalysisPrompt.js`)
- If "throttled (429)": Bedrock quota exceeded; increase `ANALYSIS_CONCURRENCY` or wait

## What's Next (Phase 4+)

- **Streaming responses**: use Bedrock's `invoke_model_with_response_stream` for faster time-to-first-token
- **Model evaluation**: A/B test different prompts with learning-service feedback
- **Semantic search**: embed CVE descriptions for similarity queries
- **Fine-tuning**: if sufficient historical feedback, train a custom model layer on top of Claude

## Contributing

See main platform README for coding guidelines. For this service specifically:
- Test all prompt changes with `npm run test:integration`
- Update `prompt_version` in `src/config/bedrock.js` when prompt changes
- Document any new model IDs tried in this README's "Model Selection" table
