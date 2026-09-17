# CVE Remediation Platform

An AI-powered, end-to-end vulnerability remediation system that ingests CVE data, analyzes it with AI, prioritizes by risk, and automates remediation workflows with Jira and GitHub integration.

## Platform Overview

This platform orchestrates an 8-phase pipeline to transform raw CVE data into prioritized, actionable remediation tasks - alongside a separate, parallel workflow for scanning your own projects directly and remediating what's found in them automatically.

```
Phase 1: CVE Ingestion
  NVD/MITRE/Vendor → Normalized Schema → PostgreSQL

Phase 2-3: Enrichment
  AI Analysis (Bedrock) → Risk Scoring → Remediation Planning

Phase 4-5: Automation
  Playbook Generation → Jira Tickets

Phase 6: Visualization
  Dashboard & Reports

Phase 7-8: Deployment & Learning
  K8s/Cloud Monitoring → Feedback Loop & Calibration

Scanner workflow (parallel to the above):
  Trivy Scan (local folder or GitHub URL) → Scanner Findings
    → One Jira Ticket per Scan → One GitHub PR Referencing It
```

## Architecture

### System Components

| Phase | Service | Language | Purpose |
|-------|---------|----------|---------|
| **1** | **Ingestion Service** | Java (Spring Boot) | Ingest CVEs from NVD, MITRE (CVE Program), and vendor RSS/Atom feeds; normalize and store in PostgreSQL. Also owns the Trivy-based project scanner, GitHub PR automation, and the one-ticket-per-scan Jira integration (see "Scanner Workflow" below) |
| **2** | (Shared DB) | PostgreSQL (or H2 for local dev - see below) | Single schema authority for all services; Flyway migrations owned by ingestion-service |
| **3** | **AI Analysis Service** | Node.js (Express) | AWS Bedrock integration: simplify descriptions, assess exploitability, generate remediation recommendations |
| **4** | **Risk Engine Service** | Java (Spring Boot) | Weighted risk scoring: combine CVSS, exploitability, asset criticality, network exposure, business impact into 0-100 score. CVE listing is sorted most-recently-scored first |
| **5** | **Remediation Service** | Node.js (Express) | Generate remediation playbooks and optional Jira tickets for HIGH/CRITICAL CVEs (one ticket per CVE, for the general risk-scored population); track resolution status |
| **6** | **Dashboard** | React + Vite | CVE Explorer (risk stats, pipeline controls, CVE table), Scanner Findings (project scanning, Jira + PR automation, Fix PR history), Pipeline Health (per-stage status), Continuous Learning |
| **7** | (Infrastructure) | Terraform + Docker + K8s | EKS cluster, RDS PostgreSQL, ECR, Secrets Manager, ALB, monitoring (CloudWatch/Prometheus) |
| **8** | **Learning Service** | Node.js (Express) | Capture analyst feedback and remediation outcomes; generate calibration reports with plain-language recommendations |

### Data Flow

```
CVE Sources
    ↓
[Ingestion Service] → cve, ingestion_state, ingestion_log
    ↓
[AI Analysis Service] → cve_analysis
    ↓
[Risk Engine Service] → risk_score, asset_profile
    ↓
[Remediation Service] → remediation_action (with Jira references)
    ↓
[Dashboard] + [Learning Service] ← User feedback & outcomes


Scanner workflow (parallel, ingestion-service only):
Local folder or GitHub URL
    ↓
[Trivy scan] → scanner_finding
    ↓
[One Jira ticket for the whole scan] → remediation_action (dedup-marked
    ↓                                    so remediation-service's scheduled
[One GitHub PR referencing that ticket]  job doesn't also ticket these CVEs
    ↓                                    individually later)
fix_pr (includes the linked jira_ticket_key/url)
```

### Technology Stack

#### Backend Services
- **Java Services**: Spring Boot 4.1.0, Spring Data JPA, Flyway migrations, Lombok
- **Node Services**: Express 4.19.2, pg 8.12.0, node-cron 3.0.3, prom-client (metrics)
- **Database**: PostgreSQL 16+ with Flyway versioned migrations. `ingestion-service` and `risk-engine-service` can alternatively run against a local H2 file database via the `h2` Spring profile, for development without installing Postgres - see "Local Database Options" below for the real tradeoffs before relying on this
- **AWS**: Bedrock (Claude/Anthropic models), Secrets Manager, ECR, EKS, RDS, IAM IRSA
- **External APIs**: NVD REST API 2.0, MITRE GitHub (cvelistV5), Vendor RSS/Atom feeds, Jira REST API, GitHub REST API (PR/branch automation), Trivy (project scanning)

#### Frontend
- **React 18+** with Vite (development server + production bundler)
- **TypeScript** for type safety
- **CSS custom properties**: severity ramp (`--severity-low` through `--severity-critical`), dark theme
- **Fonts**: IBM Plex Sans + IBM Plex Mono (tabular numbers for alignment)

#### Infrastructure
- **Container Orchestration**: Kubernetes (EKS on AWS)
- **Infrastructure as Code**: Terraform (provisioning, networking, IAM, monitoring)
- **CI/CD**: GitLab CI (or GitHub Actions - adapt as needed)
- **Local Development**: Docker Compose (Postgres + services), LocalStack + mock-bedrock (full offline testing), or `run-all-services-local.bat` to build/install/run every service as plain local processes without Docker at all (see below)

## Quick Start

### Prerequisites
- Docker & Docker Compose (or see "Running Without Docker" below)
- Node.js 20+ (for frontend dev)
- Java 25 (for backend services, or use Docker)
- PostgreSQL 16+ (if running outside Docker), or H2 - see "Local Database Options"
- AWS CLI configured (for Bedrock access) OR LocalStack for offline testing
- A GitHub personal access token (Contents + Pull Requests read/write) if you want the scanner workflow's PR automation
- A Jira Cloud API token if you want real tickets created instead of dry-run playbooks

### Local Development Setup

#### 1. Clone and Navigate
```bash
cd cve-remediation-platform
```

#### 2. Start All Services with Docker Compose
```bash
docker compose up --build
```

This starts:
- PostgreSQL (with Flyway migrations applied)
 - Ingestion Service (port 8080)
 - AI Analysis Service (port 3000)
 - Risk Engine Service (port 8083)
 - Remediation Service (port 3001)
 - Learning Service (port 3002)

#### 3. Start Dashboard (separate terminal)
```bash
cd services/dashboard
npm install
cp .env.example .env          # Edit if services aren't on default ports
npm run dev                   # http://localhost:5173
```

#### 4. Trigger the Pipeline

**CVE Explorer tab** in the dashboard has a "Pipeline controls" card with a button per stage, plus "Run full pipeline" to run all of them in sequence with live progress:
1. **Trigger ingestion** (pulls latest from NVD/MITRE/vendor feeds)
2. **Trigger analysis** (AI Analysis Service)
3. **Trigger risk scoring** (Risk Engine Service)
4. **Trigger remediation** (creates Jira tickets for HIGH/CRITICAL CVEs, if configured)

Or use curl to trigger manually:
```bash
# Ingest CVEs
curl -X POST http://localhost:8080/api/ingestion/trigger/NVD

# Analyze (after ingestion)
curl -X POST http://localhost:3000/api/analysis/trigger

# Score (after analysis)
curl -X POST http://localhost:8083/api/risk/trigger

# Remediate (after scoring)
curl -X POST http://localhost:3001/api/remediation/trigger
```

**Scanner Findings tab** is a separate, parallel workflow for scanning your own projects rather than the general CVE feed - see "Scanner Workflow" below.

#### 5. Full Offline Testing (No AWS Account)

See [`docs/localstack-guide.md`](docs/localstack-guide.md) for a complete LocalStack + mock-Bedrock setup that requires no AWS credentials.

#### 6. Running Without Docker

`run-all-services-local.bat` (repo root, Windows) builds and starts all 7 processes locally with no containers at all: compiles both Java services with Maven, installs and syntax-checks all 4 Node services (`ai-analysis-service`, `remediation-service`, `learning-service`, `mock-bedrock`), builds and starts the dashboard, then health-checks everything. Any compile/install failure stops the script immediately with nothing partially deployed. Useful when Docker isn't available or you want faster iteration without rebuilding images.

## Services Overview

### [Phase 1: Ingestion Service](services/ingestion-service/README.md)
Fetches CVEs from multiple sources, normalizes into a common schema, stores in PostgreSQL. Also owns the project-scanning and GitHub/Jira automation workflow.

**Key Features:**
- Multi-source connectors: NVD API 2.0, MITRE cvelistV5, vendor RSS/Atom feeds
- Independent, configurable cron schedules per source
- Ingestion state tracking (watermarks) for incremental syncs
- Audit trail of every run (counts, errors, timing)
- CVE archival: CVEs older than a configurable retention period get flagged (`archived_at`) rather than deleted or moved - reversible, and every other table's data for an archived CVE is untouched
- **Scanner workflow** (new): Trivy-based scanning of a local folder or a GitHub URL directly, GitHub PR automation (single-finding or batch, with automatic version consolidation when multiple CVEs affect the same package), and a one-ticket-per-scan Jira integration that runs before the PR so the PR's branch name/title/body can reference the ticket

### [Phase 3: AI Analysis Service](services/ai-analysis-service/README.md)
Uses AWS Bedrock to generate AI-powered insights on each CVE.

**Key Features:**
- AWS Bedrock integration (Claude/Anthropic models with fallbacks)
- Selection by priority: highest CVSS first, then unanalyzed/failed
- Concurrency control to respect Bedrock rate limits
- Local mock-bedrock for offline testing
- Results: simplified description, exploitability level, impact, remediation steps
- SQL kept portable across Postgres and H2 (no `ON CONFLICT ... DO UPDATE`)

### [Phase 4: Risk Engine Service](services/risk-engine-service/README.md)
Combines five factors into a prioritized 0-100 risk score.

**Key Features:**
- Weighted scoring: CVSS (35%) + Exploitability (25%) + Asset Criticality (20%) + Network Exposure (10%) + Business Impact (10%)
- Configurable asset profiles per vendor/product or global default
- Component-level scoring breakdown (answer "why is this CRITICAL?")
- Model versioning: bump version to trigger full re-score
- CVE listing sorted most-recently-scored first (not by risk score) so a fresh scan or pipeline run is immediately visible at the top

### [Phase 5: Remediation Service](services/remediation-service/README.md)
Generates structured remediation playbooks and optional Jira tickets for the general risk-scored CVE population (independent of any project scan).

**Key Features:**
- Playbook generation: AI recommendations + operational steps + SLA windows
- Jira integration (optional): dry-run mode if not configured - a startup log line states plainly whether Jira is configured and, if not, exactly which of `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`/`JIRA_PROJECT_KEY` is missing
- SLA windows: CRITICAL 24h, HIGH 72h, MEDIUM 2 weeks, LOW 30 days
- Automatic re-planning if risk level changes
- One ticket per CVE (distinct from ingestion-service's scanner workflow, which creates one ticket per *scan* instead) - the two mechanisms coexist without duplicating tickets for the same CVE
- SQL kept portable across Postgres and H2 (no `ON CONFLICT ... DO UPDATE`, no `EXTRACT(EPOCH FROM ...)` date math)

### [Phase 6: Dashboard](services/dashboard/README.md)
Unified React frontend, now four tabs instead of the original "Overview" design:

- **CVE Explorer** (default landing tab): Critical/High/Medium risk-level counts, "Pipeline controls" (trigger each stage individually or run the full pipeline with live progress), and the full CVE table with filters, pagination, and an inline detail panel per CVE
- **Scanner Findings**: scan a project (local folder or GitHub URL), or run the full "push, scan, file Jira ticket & open PR" pipeline in one action - real branch dropdown populated from GitHub, Fix PR history with a linked Jira ticket column
- **Pipeline Health**: per-stage funnel showing how many CVEs are sitting at each point in the pipeline
- **Continuous Learning**: calibration reports, unchanged from the original design

**Key Features:**
- CVE detail panel with AI analysis, risk breakdown, Jira links
- Filterable, paginated CVE table
- Live step-by-step progress display for any multi-stage action (full pipeline run, or the scanner's push/scan/ticket/PR sequence)

### [Phase 8: Learning Service](services/learning-service/README.md)
Captures user feedback and generates calibration reports.

**Key Features:**
- Analyst feedback: rate AI analysis or risk score (1-5)
- Remediation outcome tracking: resolved, SLA met/missed
- Calibration reports: per-level average ratings, SLA-met rates, per-prompt-version stats
- Recommendations: actionable suggestions (never auto-applied)
- SQL kept portable across Postgres and H2 (no `RETURNING`, no `::type` cast shorthand)

## Scanner Workflow

A separate, parallel path to the main 8-phase pipeline, for scanning your own projects directly rather than working from the general NVD/MITRE/vendor CVE feed. Lives entirely in `ingestion-service` and the dashboard's Scanner Findings tab.

**Two ways to scan:**
- **Scan only** - point it at a local folder or a GitHub URL; records findings, nothing else
- **Full pipeline** ("Push, scan, file Jira ticket & open PR") - pushes a local folder to GitHub first (skipped entirely if you give a GitHub URL instead, since there's nothing to push), scans it with Trivy, creates **one** Jira ticket covering every fixable finding (with a rich per-CVE description: package, old→new version, severity), then opens **one** PR that references that ticket in its branch name, title, and body

**Notable design decisions:**
- When multiple CVEs affect the same package (common - e.g. several `log4j-core` CVEs each suggesting a different fix version), the file is bumped **once** to the single highest version among them, not once per CVE - bumping sequentially would silently overwrite each earlier bump
- Before creating a new PR or ticket, existing `fix_pr` history is checked so an already-open PR for the same CVE+package+repo isn't duplicated
- If a GitHub branch gets created but a later step (commit or PR-open) fails, that branch is deleted automatically rather than left orphaned
- Base branch is a real dropdown of the repo's actual branches (fetched from GitHub), not a guess at "main"/"master"

## Local Database Options

`ingestion-service` and `risk-engine-service` can run against H2 instead of Postgres via the `h2` Spring profile (`--spring.profiles.active=h2`), for local development without installing Postgres. **This does not extend to the three Node services** (`ai-analysis-service`, `remediation-service`, `learning-service`) in the same way - they connect via Node's `pg` driver, which speaks Postgres's actual wire protocol, not H2's native protocol. Their SQL has been made portable (see each service's notes above), but connecting them to H2 at all requires running H2's separate `-pg` server-mode process, which has its own documented gaps (no `RETURNING`, no `COPY`) - and whether that mode can safely coexist with the Java services' native H2 access to the same file at the same time hasn't been verified against a live setup. Start with just the two Java services on H2 and confirm that works before attempting the Node side.

Flyway migrations use some PostgreSQL-specific types (`TIMESTAMPTZ`, `JSONB`) not individually verified against H2 - the first real run may surface a migration that needs a fix.

## Database Schema

All tables are defined in **ingestion-service's** Flyway migrations (`src/main/resources/db/migration/`), maintaining single schema authority:

| Table | Owner | Purpose |
|-------|-------|---------|
| `cve` | Ingestion | Normalized CVE records (one per CVE ID). `archived_at` (nullable) flags CVEs older than the retention window without deleting or moving them |
| `ingestion_state` | Ingestion | Last-sync watermark per source |
| `ingestion_log` | Ingestion | Audit trail of each ingestion run |
| `scanner_finding` | Ingestion | Trivy scan results per project: package, installed/fixed version, severity, source file |
| `fix_pr` | Ingestion | Every GitHub PR opened from a scanner finding - old/new version, branch, PR URL, and the linked `jira_ticket_key`/`jira_ticket_url` if one exists |
| `cve_analysis` | AI Analysis | AI-generated insights (description, exploitability, impact, recommendations) |
| `risk_score` | Risk Engine | Computed risk scores with component breakdown |
| `asset_profile` | Risk Engine | Config: per-vendor/product criticality, exposure, impact |
| `remediation_action` | Remediation | Playbook + Jira ticket references, status tracking. Populated both by remediation-service's own per-CVE scheduled job and by ingestion-service's per-scan ticket creation (the latter writes here too, specifically so the former doesn't duplicate a ticket for the same CVE later) |
| `feedback` | Learning | Analyst ratings on analysis/risk accuracy or remediation outcomes |
| `calibration_report` | Learning | Per-level and per-prompt-version aggregations + recommendations |

## Environment Configuration

Each service reads its configuration from:
1. `application.yml` (Java) or `.env.example` (Node) - defaults and documentation
2. Environment variables (override defaults, used in Docker/K8s)
3. AWS Secrets Manager (production secrets, mounted via IRSA)

### Common Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | All services | PostgreSQL connection |
| `GITHUB_TOKEN` | Ingestion | GitHub PR/branch automation for the scanner workflow (Contents + Pull Requests read/write) |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_ISSUE_TYPE` | Remediation **and** Ingestion | Jira integration (optional, dry-run if any value is missing) - now needed in **both** services since ingestion-service creates its own per-scan tickets separately from remediation-service's per-CVE ones. Each service needs its own copy of these values |
| `BEDROCK_PRIMARY_MODEL_ID`, `BEDROCK_FALLBACK_MODEL_IDS` | AI Analysis | Model selection (Claude 3 Sonnet/Haiku, etc.) |
| `BEDROCK_ENDPOINT_URL` | AI Analysis | Override Bedrock endpoint (for local mock) |

See individual service READMEs for complete configuration details.

## Deployment

### Development & Testing
- **Docker Compose** (`docker-compose.yml`): full local stack
- **LocalStack** (`docker-compose.localstack.yml`): offline testing with mock AWS services
- **`run-all-services-local.bat`**: all 7 services as plain local processes, no Docker - see "Running Without Docker" above

### Kubernetes (Production)
- **K8s manifests** (`k8s/`): deployments, services, configmaps, secrets, ingress
- **Terraform** (`infra/terraform/`): EKS cluster, RDS, ECR, Secrets Manager, IAM roles, monitoring

See [`docs/phase7-deployment-guide.md`](docs/phase7-deployment-guide.md) for step-by-step cloud deployment.

## Testing

Each service includes unit and integration tests:

```bash
# Java services
cd services/ingestion-service
mvn test

cd services/risk-engine-service
mvn test

# Node services
cd services/ai-analysis-service
npm test

cd services/remediation-service
npm test

cd services/learning-service
npm test

# Frontend
cd services/dashboard
npm test
```

## Monitoring & Observability

### Metrics
- **Prometheus**: exposed on `/metrics` (prom-client library in Node services, Micrometer in Java)
- **CloudWatch**: logs and custom metrics in production
- **Dashboards**: Grafana (in production setup)

### Logging
- **Local/Docker**: stdout (containerized logs visible via `docker logs` or `docker compose logs -f`)
- **Production**: CloudWatch Logs (all services stream structured JSON logs)

### Health Checks
- **Spring Boot services**: `/actuator/health` (ingestion, risk-engine)
- **Node services**: `GET /health` (ai-analysis, remediation, learning, mock-bedrock, dashboard)
- **K8s probes**: `readinessProbe` and `livenessProbe` in all deployments

## Known Limitations & Future Work

### Phase 7+
- **Multi-tenant support**: currently single-tenant; roadmap includes org/team isolation
- **Advanced auth**: current K8s setup has basic RBAC; full OIDC/SSO for dashboard pending
- **Alerting**: CloudWatch alarms configured; Alertmanager integration for on-call routing not yet built

### Scanner workflow
- **H2 support for the 3 Node services is unverified** beyond making their SQL portable - actually connecting them to H2's `-pg` server mode alongside the Java services' native access to the same file hasn't been tested end to end
- **Flyway migrations' H2 compatibility is unverified** for the same reason - PostgreSQL-specific types may need per-migration fixes the first time they're actually run against H2
- **Re-prioritization edge case**: if a CVE covered by a per-scan ticket later gets its risk score recomputed with a newer timestamp, remediation-service's existing scheduled job could still pick it up again - pre-existing system behavior, not introduced by the scanner workflow specifically

### Beyond Phase 8
- **EPSS scores**: Exploit Prediction Scoring System integration (KEV data enrichment)
- **Vendor-specific APIs**: Cisco openVuln, MSRC CSAF, Ubuntu CVE Tracker (structured connectors)
- **Advanced NLP**: full-text/semantic search over CVE descriptions
- **ML-driven calibration**: actual model retraining vs. current rule-based recommendations

## Contributing

1. **Code Style**: Java (Google style via Checkstyle), Node (Prettier)
2. **Testing**: all PRs require test coverage (unit + integration where applicable)
3. **Schema Changes**: all DB changes via Flyway migrations (never direct DDL); increment version number
4. **Commit Messages**: follow [Conventional Commits](https://www.conventionalcommits.org/)

## Support & Documentation

- **Architecture Deep Dive**: See individual service READMEs
- **Local Dev Troubleshooting**: [`docs/localstack-guide.md`](docs/localstack-guide.md)
- **Deployment**: [`docs/phase7-deployment-guide.md`](docs/phase7-deployment-guide.md)
- **Execution Plan**: [`docs/execution-plan.md`](docs/execution-plan.md)

## License

[Your License Here]
