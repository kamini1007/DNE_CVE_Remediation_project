# CVE Remediation Platform

An AI-powered, end-to-end vulnerability remediation system that ingests CVE data, analyzes it with AI, prioritizes by risk, and automates remediation workflows with Jira integration.

## Platform Overview

This platform orchestrates an 8-phase pipeline to transform raw CVE data into prioritized, actionable remediation tasks:

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
```

## Architecture

### System Components

| Phase | Service | Language | Purpose |
|-------|---------|----------|---------|
| **1** | **Ingestion Service** | Java (Spring Boot) | Ingest CVEs from NVD, MITRE (CVE Program), and vendor RSS/Atom feeds; normalize and store in PostgreSQL |
| **2** | (Shared DB) | PostgreSQL | Single schema authority for all services; Flyway migrations owned by ingestion-service |
| **3** | **AI Analysis Service** | Node.js (Express) | AWS Bedrock integration: simplify descriptions, assess exploitability, generate remediation recommendations |
| **4** | **Risk Engine Service** | Java (Spring Boot) | Weighted risk scoring: combine CVSS, exploitability, asset criticality, network exposure, business impact into 0-100 score |
| **5** | **Remediation Service** | Node.js (Express) | Generate remediation playbooks and optional Jira tickets for HIGH/CRITICAL CVEs; track resolution status |
| **6** | **Dashboard** | React + Vite | Unified visualization: overview, CVE explorer, detail panels, continuous learning reports |
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
```

### Technology Stack

#### Backend Services
- **Java Services**: Spring Boot 4.1.0, Spring Data JPA, Flyway migrations, Lombok
- **Node Services**: Express 4.19.2, pg 8.12.0, node-cron 3.0.3, prom-client (metrics)
- **Database**: PostgreSQL 16+ with Flyway versioned migrations
- **AWS**: Bedrock (Claude/Anthropic models), Secrets Manager, ECR, EKS, RDS, IAM IRSA
- **External APIs**: NVD REST API 2.0, MITRE GitHub (cvelistV5), Vendor RSS/Atom feeds, Jira REST API

#### Frontend
- **React 18+** with Vite (development server + production bundler)
- **TypeScript** for type safety
- **CSS custom properties**: severity ramp (`--severity-low` through `--severity-critical`), dark theme
- **Fonts**: IBM Plex Sans + IBM Plex Mono (tabular numbers for alignment)

#### Infrastructure
- **Container Orchestration**: Kubernetes (EKS on AWS)
- **Infrastructure as Code**: Terraform (provisioning, networking, IAM, monitoring)
- **CI/CD**: GitLab CI (or GitHub Actions - adapt as needed)
- **Local Development**: Docker Compose (Postgres + services), LocalStack + mock-bedrock (full offline testing)

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for frontend dev)
- Java 25 (for backend services, or use Docker)
- PostgreSQL 16+ (if running outside Docker)
- AWS CLI configured (for Bedrock access) OR LocalStack for offline testing

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

**Overview tab in Dashboard** has buttons to trigger each phase:
1. Click **"Ingest CVEs"** (pulls latest from NVD/MITRE)
2. Wait for ingestion to complete, then **"Run AI Analysis"**
3. Once analysis done, **"Calculate Risk Scores"**
4. Finally **"Generate Remediation Actions"** (creates Jira tickets if configured)

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

#### 5. Full Offline Testing (No AWS Account)

See [`docs/localstack-guide.md`](docs/localstack-guide.md) for a complete LocalStack + mock-Bedrock setup that requires no AWS credentials.

## Services Overview

### [Phase 1: Ingestion Service](services/ingestion-service/README.md)
Fetches CVEs from multiple sources, normalizes into a common schema, stores in PostgreSQL.

**Key Features:**
- Multi-source connectors: NVD API 2.0, MITRE cvelistV5, vendor RSS/Atom feeds
- Independent, configurable cron schedules per source
- Ingestion state tracking (watermarks) for incremental syncs
- Audit trail of every run (counts, errors, timing)

### [Phase 3: AI Analysis Service](services/ai-analysis-service/README.md)
Uses AWS Bedrock to generate AI-powered insights on each CVE.

**Key Features:**
- AWS Bedrock integration (Claude/Anthropic models with fallbacks)
- Selection by priority: highest CVSS first, then unanalyzed/failed
- Concurrency control to respect Bedrock rate limits
- Local mock-bedrock for offline testing
- Results: simplified description, exploitability level, impact, remediation steps

### [Phase 4: Risk Engine Service](services/risk-engine-service/README.md)
Combines five factors into a prioritized 0-100 risk score.

**Key Features:**
- Weighted scoring: CVSS (35%) + Exploitability (25%) + Asset Criticality (20%) + Network Exposure (10%) + Business Impact (10%)
- Configurable asset profiles per vendor/product or global default
- Component-level scoring breakdown (answer "why is this CRITICAL?")
- Model versioning: bump version to trigger full re-score

### [Phase 5: Remediation Service](services/remediation-service/README.md)
Generates structured remediation playbooks and optional Jira tickets.

**Key Features:**
- Playbook generation: AI recommendations + operational steps + SLA windows
- Jira integration (optional): dry-run mode if not configured
- SLA windows: CRITICAL 24h, HIGH 72h, MEDIUM 2 weeks, LOW 30 days
- Automatic re-planning if risk level changes

### [Phase 6: Dashboard](services/dashboard/README.md)
Unified React frontend: overview, CVE explorer, detail panels, calibration reports.

**Key Features:**
- Real-time pipeline overview with severity ramp visualization
- CVE detail panel with AI analysis, risk breakdown, Jira links
- Filterable tables (by severity, status, etc.)
- Continuous Learning reports: per-level statistics and recommendations

### [Phase 8: Learning Service](services/learning-service/README.md)
Captures user feedback and generates calibration reports.

**Key Features:**
- Analyst feedback: rate AI analysis or risk score (1-5)
- Remediation outcome tracking: resolved, SLA met/missed
- Calibration reports: per-level average ratings, SLA-met rates, per-prompt-version stats
- Recommendations: actionable suggestions (never auto-applied)

## Database Schema

All tables are defined in **ingestion-service's** Flyway migrations (`src/main/resources/db/migration/`), maintaining single schema authority:

| Table | Owner | Purpose |
|-------|-------|---------|
| `cve` | Ingestion | Normalized CVE records (one per CVE ID) |
| `ingestion_state` | Ingestion | Last-sync watermark per source |
| `ingestion_log` | Ingestion | Audit trail of each ingestion run |
| `cve_analysis` | AI Analysis | AI-generated insights (description, exploitability, impact, recommendations) |
| `risk_score` | Risk Engine | Computed risk scores with component breakdown |
| `asset_profile` | Risk Engine | Config: per-vendor/product criticality, exposure, impact |
| `remediation_action` | Remediation | Playbook + Jira ticket references, status tracking |
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
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | Remediation | Jira integration (optional) |
| `BEDROCK_PRIMARY_MODEL_ID`, `BEDROCK_FALLBACK_MODEL_IDS` | AI Analysis | Model selection (Claude 3 Sonnet/Haiku, etc.) |
| `BEDROCK_ENDPOINT_URL` | AI Analysis | Override Bedrock endpoint (for local mock) |

See individual service READMEs for complete configuration details.

## Deployment

### Development & Testing
- **Docker Compose** (`docker-compose.yml`): full local stack
- **LocalStack** (`docker-compose.localstack.yml`): offline testing with mock AWS services

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
- **Node services**: `GET /health` (ai-analysis, remediation, learning, dashboard)
- **K8s probes**: `readinessProbe` and `livenessProbe` in all deployments

## Known Limitations & Future Work

### Phase 7+
- **Multi-tenant support**: currently single-tenant; roadmap includes org/team isolation
- **Advanced auth**: current K8s setup has basic RBAC; full OIDC/SSO for dashboard pending
- **Alerting**: CloudWatch alarms configured; Alertmanager integration for on-call routing not yet built

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
