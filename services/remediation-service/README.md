# Remediation Workflow Automation (Phase 5)

Node.js/Express service that turns risk-engine-service's prioritized list
into action: a structured remediation playbook for every HIGH/CRITICAL CVE,
and (if Jira is configured) an actual Jira ticket.

## How it fits with the other services

- **Inputs**: joins `cve` (Phase 2), `cve_analysis` (Phase 3 - needs a
  `SUCCESS` analysis for the AI's remediation recommendations), and
  `risk_score` (Phase 4 - needs a risk level). A CVE only gets a remediation
  action once all three upstream stages have processed it.
- **Schema ownership**: `remediation_action` is defined in
  **ingestion-service's** Flyway migrations (`V4__create_remediation_action_table.sql`) -
  same single-schema-authority pattern as every other service.
- **Playbook structure** (`src/services/playbookService.js`): the AI's own
  remediation recommendations (already priority-ordered from Phase 3) become
  the first steps, followed by two standard operational steps (verify the
  fix, close out tracking) - so every playbook is actionable end-to-end, not
  just a description of the problem. Due-by windows follow common vuln-management
  SLAs: CRITICAL 24h, HIGH 72h, MEDIUM 2 weeks, LOW 30 days.
- **Jira is optional**: if `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`/`JIRA_PROJECT_KEY`
  aren't all set, the service runs in dry-run mode - playbooks are still
  generated and stored (`status = PLAYBOOK_GENERATED`), just no real ticket
  gets created. This means the service is useful on day one, before a Jira
  integration is even set up.
- **Selection logic** (`src/repository/riskScoreRepository.js`): only CVEs at
  or above `REMEDIATION_MIN_RISK_LEVEL` (default `HIGH`) get a remediation
  action - most vuln management programs don't want a Jira ticket for every
  LOW/MEDIUM finding. Re-scored CVEs (risk changed since the last remediation
  action) get a fresh playbook automatically.

## Running locally

```bash
npm install
cp .env.example .env   # adjust DB_*; leave JIRA_* blank for dry-run mode
npm start
```

Requires `cve`, `cve_analysis`, and `risk_score` to already have data - i.e.
ingestion-service, ai-analysis-service, and risk-engine-service must have all
run first (in that order) against the target database.

## Testing

```bash
npm test
```

`playbookService.test.js` covers step ordering, SLA-window mapping, and
missing-recommendations handling with no DB/network. `jiraClient.test.js`
covers both dry-run mode (asserts `fetch` is never called) and configured
mode (mocked `fetch`, request-body shape, and error handling) without making
real HTTP calls.

## API

| Endpoint | Description |
|---|---|
| `POST /api/remediation/trigger` | Manually trigger a batch run (async). Optional body: `{ "batchSize": 10 }`. |
| `POST /api/remediation/cve/:cveId` | Synchronously generate a remediation action for one CVE now. |
| `GET /api/remediation/cve/:cveId` | Fetch the stored remediation action (playbook + Jira ticket ref) for one CVE. |
| `GET /api/remediation?status=TICKET_CREATED&page=0&size=20` | Paginated listing, optionally filtered by status. |
| `GET /health` | Liveness/readiness probe target. |

## What's next (Phase 6)

The React dashboard will visualize the whole pipeline - ingested CVEs, AI
analysis, risk scores, and remediation status/Jira links - in one place.
