# Remediation Service - Phase 5

Node.js/Express microservice that converts risk-scored CVE vulnerabilities into **actionable remediation workflows**. Generates structured remediation playbooks and optionally creates Jira tickets for tracking.

This is where CVE data becomes *operational action* — Jira tickets drive team accountability, ticket status feeds back into learning, and playbook steps guide remediation execution.

Consumes:
- **`cve` table** (Phase 1) — CVE metadata
- **`cve_analysis` table** (Phase 3) — AI-generated remediation recommendations
- **`risk_score` table** (Phase 4) — prioritization (only HIGH/CRITICAL get tickets by default)

Produces:
- **`remediation_action` table** — playbooks, ticket references, status tracking
- **Jira tickets** (optional) — issue creation + status sync

Consumed by:
- **Dashboard** (Phase 6) — displays remediation status, Jira links
- **Learning Service** (Phase 8) — tracks resolution outcomes, SLA performance

## Architecture

### Component Diagram

```
┌────────────────────────────────────────────────────────────┐
│              Remediation Service                           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Selection Logic (RiskScoreRepository)              │ │
│  │                                                      │ │
│  │  Include CVEs where:                                 │ │
│  │  • risk_score.severity_level ≥ REMEDIATION_MIN_RISK │ │
│  │  • no existing remediation_action, OR                │ │
│  │  • risk_score is newer than remediation_action.     │ │
│  │    updated_at (re-plan if priority changed)         │ │
│  │  Order by: risk_score.overall_score DESC            │ │
│  └──────────────────────────────────────────────────────┘ │
│                        │                                  │
│                        ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Playbook Generation (PlaybookService)              │ │
│  │                                                      │ │
│  │  1. AI recommendations (from cve_analysis):         │ │
│  │     remediationSteps sorted by priority             │ │
│  │                                                      │ │
│  │  2. + Verification step (manual)                    │ │
│  │  3. + Close-out step (close ticket/mark complete)   │ │
│  │                                                      │ │
│  │  4. SLA window based on severity:                   │ │
│  │     CRITICAL: 24h   HIGH: 72h                       │ │
│  │     MEDIUM: 2 weeks LOW: 30 days                    │ │
│  │                                                      │ │
│  │  Store as JSON array of { step, description, SLA } │ │
│  └──────────────────────────────────────────────────────┘ │
│                        │                                  │
│                        ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Jira Integration (JiraClient — OPTIONAL)           │ │
│  │                                                      │ │
│  │  IF all JIRA_* env vars set:                        │ │
│  │    • Create issue (type: Bug/Story)                 │ │
│  │    • Set description with playbook steps            │ │
│  │    • Set due date (today + SLA window)              │ │
│  │    • Set severity label (CRITICAL/HIGH/MEDIUM/LOW)  │ │
│  │    • Return issue key (e.g., SCRUM-123)             │ │
│  │                                                      │ │
│  │  ELSE (dry-run mode):                               │ │
│  │    • Skip Jira API calls                            │ │
│  │    • Still generate playbook                        │ │
│  │    • Set status=PLAYBOOK_GENERATED (no ticket)      │ │
│  └──────────────────────────────────────────────────────┘ │
│                        │                                  │
│                        ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Persistence (RemediationActionRepository)          │ │
│  │                                                      │
│  │  Write to `remediation_action` table:               │ │
│  │  • playbook (JSON)                                  │ │
│  │  • status: PLAYBOOK_GENERATED or TICKET_CREATED    │ │
│  │  • jira_ticket_key (if ticket created)             │ │
│  │  • assigned_to (optional)                           │ │
│  │  • due_date (today + SLA window)                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
          ↓
   PostgreSQL (shared schema)
   Table: remediation_action
   (+ optional Jira REST API calls)
```

### Key Concepts

**Playbook Structure**
Each remediation_action contains a JSON playbook:
```json
{
  "steps": [
    {
      "step": 1,
      "description": "Apply kernel security patch from vendor advisory",
      "effort": "MEDIUM",
      "source": "AI_ANALYSIS"
    },
    {
      "step": 2,
      "description": "Reboot affected systems within 24-hour window",
      "effort": "MEDIUM",
      "source": "AI_ANALYSIS"
    },
    {
      "step": 3,
      "description": "Verify patch installation and system stability",
      "effort": "LOW",
      "source": "STANDARD_VERIFICATION"
    },
    {
      "step": 4,
      "description": "Close this ticket once remediation confirmed",
      "effort": "LOW",
      "source": "STANDARD_CLOSEOUT"
    }
  ],
  "sla_hours": 72,
  "due_date": "2024-08-29T14:35:00Z"
}
```

**Dry-Run Mode**
If any of `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` are missing:
- Playbooks are still generated and stored
- No Jira API calls are made (`fetch` never called)
- Status is marked `PLAYBOOK_GENERATED` (not `TICKET_CREATED`)
- Useful for testing without Jira access

**SLA Windows**
Determined by risk_score.severity_level:
- **CRITICAL** → 24 hours (drop everything, immediate attention)
- **HIGH** → 72 hours (fix within 3 business days)
- **MEDIUM** → 2 weeks (planned remediation sprint)
- **LOW** → 30 days (backlog for future handling)

**Re-Planning**
If a CVE's risk level changes (e.g., new exploit disclosed, new asset profile configured):
- Existing remediation_action is detected
- If risk_score.updated_at > remediation_action.updated_at, a new playbook is generated
- Jira ticket is not re-created; existing ticket is updated with new due date

## Code Structure

```
src/
├── index.js                       # Express entry, scheduling setup
├── app.js                         # Express server (routes, middleware, CORS)
├── config/
│   └── database.js                # PostgreSQL connection pool
├── db/
│   └── init.js                    # Schema validation (remediation_action must exist)
├── repository/
│   ├── riskScoreRepository.js     # Query unprocessed HIGH/CRITICAL CVEs
│   ├── remediationRepository.js   # Persist remediation actions
│   └── cveRepository.js           # Fetch CVE metadata + analysis
├── routes/
│   ├── remediation.js             # POST /api/remediation/trigger, etc.
│   └── health.js                  # GET /health
├── scheduler/
│   └── remediationScheduler.js    # node-cron job, calls remediationService
├── services/
│   ├── remediationService.js      # Orchestration: select → plan → jira → persist
│   ├── playbookService.js         # Playbook generation logic
│   └── jiraClient.js              # Jira REST API wrapper (dry-run aware)
├── metrics/
│   └── prometheus.js              # prom-client counters, histograms
└── utils/
    ├── logger.js                  # Structured logging
    └── errors.js                  # Custom error classes
```

## Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ with data from Phases 1, 3, & 4
- (Optional) Jira Cloud/Server instance with API token

### Setup

1. **Install dependencies**
```bash
npm install
```

2. **Copy .env.example to .env and configure**
```bash
cp .env.example .env
```

3. **Configure database connection**
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cve_db
DB_USER=postgres
DB_PASSWORD=postgres
```

4. **(Optional) Configure Jira**

If you have Jira:
```bash
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=<your-api-token>  # https://id.atlassian.com/manage/api-tokens
JIRA_PROJECT_KEY=YOUR_PROJECT_KEY
JIRA_ISSUE_TYPE=Bug               # or Story, Task, etc.
```

If you don't have Jira (or want to test without creating real tickets):
- Leave `JIRA_*` vars blank or unset
- Service runs in dry-run mode (playbooks generated, no tickets)

5. **Start the service**
```bash
npm start
```

The service will:
- Connect to PostgreSQL and validate schema
- Kick off the first remediation batch at next cron boundary
- Start listening on `http://localhost:3001`

### Manual Trigger

```bash
# Trigger a remediation batch run (async)
curl -X POST http://localhost:3001/api/remediation/trigger

# Or with custom batch size:
curl -X POST "http://localhost:3001/api/remediation/trigger?batchSize=10"

# Synchronously generate remediation for one CVE
curl -X POST http://localhost:3001/api/remediation/cve/CVE-2024-12345
```

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Express server port |
| `DB_HOST` | `localhost` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `cve_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `JIRA_BASE_URL` | (empty) | Jira instance URL (e.g., `https://org.atlassian.net`); omit for dry-run |
| `JIRA_EMAIL` | (empty) | Jira account email |
| `JIRA_API_TOKEN` | (empty) | Jira API token (get from https://id.atlassian.com/manage/api-tokens) |
| `JIRA_PROJECT_KEY` | (empty) | Jira project key (e.g., `SCRUM`) |
| `JIRA_ISSUE_TYPE` | `Bug` | Issue type to create (Bug, Story, Task, etc.) |
| `REMEDIATION_CRON` | `0 0 */2 * * *` | Cron expression (default: every 2 hours) |
| `REMEDIATION_BATCH_SIZE` | `50` | CVEs planned per batch run |
| `REMEDIATION_MIN_RISK_LEVEL` | `HIGH` | Min severity to get remediation (HIGH, MEDIUM, or LOW) |
| `LOG_LEVEL` | `INFO` | Logging verbosity (DEBUG, INFO, WARN, ERROR) |

### SLA Configuration

Currently hardcoded in `services/playbookService.js`:
```javascript
const SLA_WINDOWS = {
  CRITICAL: 24,          // hours
  HIGH: 72,
  MEDIUM: 14 * 24,       // 2 weeks
  LOW: 30 * 24            // 30 days
};
```

To customize, edit `services/playbookService.js` and restart.

## API Endpoints

### Remediation Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/remediation/trigger` | Manually trigger a batch run (async). Optional body: `{ "batchSize": 10 }` |
| `POST` | `/api/remediation/cve/:cveId` | Synchronously generate remediation for one CVE now |
| `GET` | `/api/remediation/cve/:cveId` | Fetch the stored remediation action (playbook + Jira link) |
| `GET` | `/api/remediation?status=TICKET_CREATED&page=0&size=20` | Paginated list, filtered by status |

### Health & Metrics

| Endpoint | Description |
|----------|-------------|
| `GET` | `/health` | Liveness/readiness probe |
| `GET` | `/metrics` | Prometheus metrics |

**Example: List all remediation actions with Jira tickets**
```bash
curl "http://localhost:3001/api/remediation?status=TICKET_CREATED&size=50" | jq '.content[] | {cve_id, jira_ticket_key, due_date}'
```

**Example: Get remediation plan for one CVE**
```bash
curl http://localhost:3001/api/remediation/cve/CVE-2024-12345 | jq '.playbook.steps'
```

## Database Schema

### `remediation_action` Table

Defined in ingestion-service's `V4__create_remediation_action_table.sql`:

| Column | Type | Purpose |
|--------|------|---------|
| `cve_id` | VARCHAR (PK, FK→cve) | CVE identifier |
| `playbook` | JSON | Array of remediation steps (see Playbook Structure above) |
| `status` | ENUM | `PLAYBOOK_GENERATED` (dry-run) or `TICKET_CREATED` (real Jira ticket) |
| `jira_ticket_key` | VARCHAR (nullable) | Jira ticket key (e.g., `SCRUM-123`); null if dry-run |
| `jira_ticket_url` | VARCHAR (nullable) | Direct link to Jira issue; null if dry-run |
| `assigned_to` | VARCHAR (nullable) | Assignee username (if Jira is configured) |
| `due_date` | TIMESTAMP | Remediation deadline (now + SLA window) |
| `resolved_at` | TIMESTAMP (nullable) | When remediation was completed (Phase 8 feedback) |
| `time_to_resolution_hours` | NUMERIC (nullable) | Hours between due_date and resolved_at (for SLA tracking) |
| `met_sla` | BOOLEAN (nullable) | Whether remediation met SLA window (Phase 8 feedback) |
| `created_at` | TIMESTAMP | When remediation action was generated |
| `updated_at` | TIMESTAMP | Last update (e.g., when Jira ticket was updated) |

## Testing

### Unit Tests

```bash
npm test
```

Covers:
- **Playbook Generation**: step ordering, SLA window calculation, missing-recommendations handling
- **Jira Dry-Run**: verifies `fetch` is never called when Jira not configured
- **Jira Creation**: mocked `fetch`, request-body shape, error handling, ticket key extraction
- **Health Endpoint**: basic connectivity

Database operations and real Jira calls are **not** exercised in tests.

### Manual End-to-End Test

1. Start all services locally:
```bash
docker compose up --build
```

2. Verify CVEs have risk scores:
```bash
curl "http://localhost:8083/api/risk?level=CRITICAL" | jq '.content | length'
```

3. Manually trigger remediation:
```bash
curl -X POST http://localhost:3001/api/remediation/trigger
```

4. Watch logs:
```bash
docker compose logs -f remediation-service
```

5. Check generated playbooks:
```bash
curl http://localhost:3001/api/remediation | jq '.content[0].playbook'
```

6. (If Jira configured) Check Jira for new tickets:
```bash
curl "http://localhost:3001/api/remediation?status=TICKET_CREATED" | jq '.content[0].jira_ticket_key'
# Open Jira and search for that ticket key
```

## Monitoring & Observability

### Metrics Exposed

- `remediation.batch.runs.total` — counter: cumulative batch runs
- `remediation.batch.duration.seconds` — histogram: batch run duration
- `remediation.actions.generated.total` — counter: total remediation actions created
- `remediation.jira.tickets.created.total` — counter: Jira tickets created
- `remediation.jira.tickets.failed.total` — counter: Jira API failures

**Scrape endpoint:** `http://localhost:3001/metrics`

### Logging

- **Local dev**: human-readable to stdout
- **Production**: structured JSON to CloudWatch Logs
- **Log level**: controlled by `LOG_LEVEL` env var

Example log output:
```
[remediation-service] 2024-08-26T14:35:22Z INFO Starting remediation batch (batchSize=50, minRiskLevel=HIGH)
[remediation-service] 2024-08-26T14:35:23Z DEBUG Retrieved 35 CVEs requiring remediation (CRITICAL: 5, HIGH: 30)
[remediation-service] 2024-08-26T14:35:24Z INFO Generating playbook for CVE-2024-12345 (risk=CRITICAL, SLA=24h)
[remediation-service] 2024-08-26T14:35:25Z INFO Creating Jira ticket for CVE-2024-12345: SCRUM-456
[remediation-service] 2024-08-26T14:35:26Z ERROR Jira API failed for CVE-2024-54321 (401 Unauthorized) — will retry next batch
[remediation-service] 2024-08-26T14:35:27Z INFO Batch complete: 34 actions generated, 32 Jira tickets created, 1 failed
```

## Troubleshooting

### "No remediation actions are being generated"
- Verify risk scores exist and are HIGH/CRITICAL: `curl "http://localhost:8083/api/risk?level=CRITICAL" | jq '.content | length'`
- Check if `REMEDIATION_MIN_RISK_LEVEL` is too high (try lowering to `MEDIUM`)
- Ensure scheduling is enabled; check logs: `docker compose logs remediation-service`

### "Jira integration not working (401 Unauthorized)"
- Verify Jira API token is valid: `curl -H "Authorization: Basic <base64(email:token)>" https://org.atlassian.net/rest/api/3/myself`
- Ensure `JIRA_API_TOKEN` is not expired (tokens expire after 1 year)
- Token must have "Manage Jira" and "Create issues" permissions

### "Playbook steps are incomplete"
- Ensure ai-analysis-service has run and generated `cve_analysis` records
- Check: `curl http://localhost:3000/api/analysis/cve/CVE-2024-12345 | jq '.remediationSteps'`
- If remediation steps are null, fallback steps are still added (verify, closeout)

### "Jira issue created, but due date is in the past"
- Check server time: remediation uses `new Date()` + SLA hours
- If server clock is wrong, fix it and re-generate remediation for that CVE: `curl -X POST http://localhost:3001/api/remediation/cve/CVE-2024-12345`

## What's Next (Phase 6+)

- **Dashboard** will show remediation status, Jira links, and playbook progress
- **Learning Service** (Phase 8) will track which tickets were resolved, SLA performance, and provide feedback for calibration

## Contributing

See main platform README. For remediation-service specifically:
- Playbook logic lives in `services/playbookService.js` (pure, testable)
- Jira API wrapper is in `services/jiraClient.js` (handles dry-run + real modes)
- Update SLA windows in `services/playbookService.js`, then test with unit tests
