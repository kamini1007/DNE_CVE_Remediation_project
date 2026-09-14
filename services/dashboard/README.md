# Dashboard & Visualization - Phase 6

React + Vite single-page application (SPA) that unifies the entire CVE remediation pipeline into one visual command center. Provides real-time overview of ingested CVEs, AI-generated insights, risk scores, remediation status, and continuous learning calibration reports.

Design philosophy:
- **Operational focus**: Leads with what needs attention (CRITICAL/HIGH counts, highest-risk CVEs), not vanity metrics
- **Severity-first visual grammar**: Every risk indicator uses a consistent five-color ramp for instant pattern recognition
- **Progressively-loaded**: Detail panels degrade gracefully — a CVE that hasn't been analyzed yet shows "not yet analyzed" for that section rather than failing the whole panel
- **No auth (yet)**: Fine for local/dev; Phase 7+ adds OIDC/SSO before production exposure

## Architecture

### Design System

**Severity Color Ramp**
The same five-color scale is used consistently across all risk/severity indicators:
- `--severity-low`: #4A90E2 (light blue)
- `--severity-medium`: #F5A623 (orange)
- `--severity-high`: #D0021B (red)
- `--severity-critical`: #8B0000 (dark red)
- Interactive controls use `--accent-blue` (#0066FF) — never part of risk scale, so clickable elements can't be misread as risk signals

**Typography**
- **Headlines/Body**: IBM Plex Sans (readable, professional)
- **All numbers/identifiers**: IBM Plex Mono with `font-variant-numeric: tabular-nums`
  - CVE IDs (CVE-2024-12345) align vertically in tables
  - Scores (79.5, 45.2) stay aligned for quick visual scanning
  - Timestamps parse uniformly

**Tokens**
All colors, spacing, fonts defined in `src/styles/tokens.css`. Zero hardcoded values in component CSS — maintainability through a single source of truth.

### Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                       Dashboard (React)                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  App.jsx (Router, Layout)                              │ │
│  │  • Sidebar navigation                                  │ │
│  │  • Tab selection (Overview, CVE Explorer, Learning)   │ │
│  └────────────────────────────────────────────────────────┘ │
│                        │                                    │
│        ┌───────────────┼───────────────┬──────────────┐    │
│        ▼               ▼               ▼              ▼    │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────┐ ┌─────────┐│
│  │  Overview   │ │CVE Explorer  │ │ Detail   │ │Learning ││
│  │  View       │ │  View        │ │ Panel    │ │ Report  ││
│  │             │ │              │ │          │ │  View   ││
│  │ • Summary   │ │• Filterable  │ │• AI      │ │• Per-   ││
│  │   stats     │ │  risk-sorted │ │  Analysis│ │  level  ││
│  │   (CRIT,    │ │  table       │ │• Risk    │ │  stats  ││
│  │   HIGH)     │ │• Pagination  │ │  Score   │ │• Recom- ││
│  │• Top CVEs   │ │• Severity    │ │• Remed.  │ │  mend-  ││
│  │• Control    │ │  badge       │ │  Status  │ │  ations ││
│  │  buttons    │ │  coloring    │ │• Jira    │ │         ││
│  │             │ │              │ │  Link    │ │         ││
│  │             │ │              │ │• Feedback│ │         ││
│  │             │ │              │ │  Widget  │ │         ││
│  └─────────────┘ └──────────────┘ └──────────┘ └─────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
        ▼
   Backend Services (async fetch)
   • Ingestion API (8080)
   • AI Analysis API (3000)
   • Risk Engine API (8083)
   • Remediation API (3001)
   • Learning API (3002)
```

## Views & Features

### 1. Overview Tab
Landing page, designed to surface what matters:

**Summary Cards** (top row)
- **CRITICAL count** + last 24h change
- **HIGH count** + last 24h change
- **Remediation backlog** (HIGH+CRITICAL with no Jira ticket yet)
- **Ticket creation rate** (per hour, 24h average)

**Top 5 Unresolved CVEs**
- Highest-risk-first table
- Columns: Severity badge (color ramp), CVE ID, CVSS, Risk Score, AI Analysis status, Jira ticket link
- Click any row → opens Detail Panel

**Pipeline Control Buttons**
Manually trigger each phase (useful for testing):
- 🟢 **Ingest CVEs** (POST `/api/ingestion/trigger/NVD`)
- 🟡 **Run AI Analysis** (POST `/api/analysis/trigger`)
- 🔴 **Calculate Risk** (POST `/api/risk/trigger`)
- 🟣 **Generate Remediations** (POST `/api/remediation/trigger`)

Each button shows last-run timestamp + elapsed time.

### 2. CVE Explorer Tab
Comprehensive, filterable CVE list:

**Filters**
- By severity: LOW / MEDIUM / HIGH / CRITICAL
- By status: Analyzed / Not analyzed / Failed
- By remediation: Ticket created / Playbook only / No remediation
- Date range: Last N days, custom range

**Table**
- Sortable by: Severity, CVSS Score, Risk Score, AI Confidence, Publish Date
- Pagination: 20/50/100 per page
- Each row shows severity badge + CVE ID + CVSS + Risk Score + Analysis progress bar

**Click Any Row**
- Slides open the Detail Panel (see below)
- Previous row selection stays highlighted until you select another

### 3. Detail Panel (Modal-Right)
Comprehensive view for one CVE, loaded progressively:

**CVE Header**
```
CVE-2024-12345
┌────────────────────────────────┐
│ CVSS: 9.8  (v3.1)              │
│ Severity: 🔴 CRITICAL          │
│ Published: 2024-08-15          │
│ Updated: 2024-08-25            │
└────────────────────────────────┘
```

**Ingestion Details** (Phase 1 - always present)
- Description
- Affected vendor/product
- Reference links
- Published date, last update

**AI Analysis Section** (Phase 3)
- Status: "In progress..." / "Success" / "Failed — [error]"
- Simplified description (AI summary)
- Exploitability level badge (CRITICAL / HIGH / MEDIUM / LOW)
- Potential impact
- Remediation steps (ordered list with effort tags)
- Feedback widget (5-star rating for "How accurate is this analysis?")

**Risk Score Breakdown** (Phase 4)
```
Overall Risk Score: 82 (CRITICAL)
┌─ CVSS Score:           79 (35% weight)
├─ Exploitability:       100 (25% weight)
├─ Asset Criticality:    100 (20% weight)
├─ Network Exposure:     50 (10% weight)
└─ Business Impact:      75 (10% weight)
```
- Each component shows individually (answering "why is this critical?")
- Feedback widget (5-star rating for "Is this risk score accurate?")

**Remediation Status** (Phase 5)
- Status: "Not planned" / "Playbook generated" / "Jira ticket created"
- If Jira ticket:
  - Ticket key (clickable → opens in Jira)
  - Due date
  - Current status (TODO, IN_PROGRESS, DONE)
  - Assigned to
- Playbook view (expandable list of steps with effort estimates)

**Jira Link**
If ticket created: `🔗 SCRUM-456 (Due: 2024-08-29)` — opens in new tab

**Close Button**
Slide the panel closed (detail persists until you clear it)

### 4. Continuous Learning Tab
Calibration insights + recommendations:

**Latest Report Card**
```
Generated: 2024-08-26 03:00 UTC
Based on: 47 analyses, 32 risk scores, 18 resolutions
Last 7 days
```

**Per-Risk-Level Statistics**
| Level | Avg Rating | SLA Met % | Count | Trend |
|-------|-----------|-----------|-------|-------|
| CRITICAL | ⭐⭐⭐⭐ (4.2) | 94% | 5 | ↑ |
| HIGH | ⭐⭐⭐⭐ (3.9) | 87% | 18 | → |
| MEDIUM | ⭐⭐⭐ (3.2) | 72% | 24 | ↓ |
| LOW | ⭐⭐ (2.1) | 68% | 12 | ↓ |

**Per-Prompt-Version Statistics**
Shows average accuracy rating for each AI prompt version (enables A/B testing):
```
Prompt v1 (Aug 15-20): ⭐⭐⭐⭐ (4.1) from 12 ratings
Prompt v2 (Aug 20-26): ⭐⭐⭐⭐ (4.3) from 8 ratings
```

**Recommendations**
Plain-language suggestions (never auto-applied):
```
🔹 MEDIUM risk level has low SLA performance (72% met).
   Consider:
   • Increase MEDIUM-level SLA window from 2 weeks to 3 weeks?
   • Review MEDIUM-level remediation_action.assigned_to — are they overloaded?

🔹 Prompt v1 received lower ratings (3.0) than Prompt v2 (4.3).
   Recommendation: Consider retiring Prompt v1 and using Prompt v2 for all new analyses.

🔹 CRITICAL-level exploitability scores may be overestimated.
   Average SLA met: 94% (high), but average analyst rating: 4.2 (high confidence).
   Current model performing well — no change needed.
```

Each recommendation points to exactly what to review (risk-engine weights, asset profile, system prompt) but requires human action to apply.

## Code Structure

```
src/
├── main.jsx                       # Vite entry, React root
├── App.jsx                        # Router, layout, navigation
├── api/
│   ├── ingestionApi.js            # API clients
│   ├── aiAnalysisApi.js
│   ├── riskEngineApi.js
│   ├── remediationApi.js
│   └── learningApi.js
├── components/
│   ├── Layout.jsx                 # Sidebar, header
│   ├── SeverityBadge.jsx          # Color-coded severity indicator
│   ├── CveTable.jsx               # Paginated CVE table
│   ├── DetailPanel.jsx            # Right-slide modal
│   ├── FeedbackWidget.jsx         # 5-star rating (Phase 8)
│   ├── Overview/
│   │   ├── SummaryCards.jsx       # CRITICAL/HIGH/backlog counters
│   │   ├── TopCvesList.jsx        # Top 5 unresolved
│   │   └── PipelineControls.jsx   # Manual trigger buttons
│   ├── CveExplorer/
│   │   ├── FilterBar.jsx          # Severity, status, date filters
│   │   └── CveTable.jsx           # Main table
│   └── Learning/
│       ├── ReportCard.jsx         # Header + timestamp
│       ├── RiskLevelStats.jsx     # Per-level table
│       ├── PromptVersionStats.jsx # Per-prompt-version table
│       └── Recommendations.jsx    # Suggestion list
├── hooks/
│   ├── useCveList.js              # Fetch + cache CVEs
│   ├── useDetailPanel.js          # State for selected CVE + panel
│   ├── useFilters.js              # Filter state
│   └── useFeedback.js             # Submit rating to learning service
├── styles/
│   ├── tokens.css                 # All colors, spacing, fonts (single source of truth)
│   ├── layout.css                 # Grid, flexbox
│   ├── components.css             # Reusable component styles
│   └── theme.css                  # Dark theme
├── utils/
│   ├── formatters.js              # formatSeverity, formatDate, formatCvss
│   ├── validators.js              # Input validation (levels, dates)
│   └── cache.js                   # Simple in-memory cache (fetch result caching)
└── views/
    ├── OverviewView.jsx
    ├── CveExplorerView.jsx
    └── LearningView.jsx
```

## Running Locally

### Prerequisites
- Node.js 20+
- npm (comes with Node.js)
- All backend services running (ingestion, ai-analysis, risk-engine, remediation, learning)

### Setup

```bash
cd services/dashboard

# 1. Install dependencies
npm install

# 2. Copy .env.example to .env
cp .env.example .env

# 3. Adjust URLs if backends aren't on default ports
# Edit .env:
# VITE_INGESTION_API_URL=http://localhost:8080
# VITE_AI_ANALYSIS_API_URL=http://localhost:3000
# etc.

# 4. Start dev server
npm run dev     # http://localhost:5173
```

Open browser to `http://localhost:5173` — hot-reload enabled for any file changes.

### Building for Production

```bash
# Build static assets
npm run build

# Output: dist/
# Deploy dist/ to a CDN or web server
```

Vite inlines `VITE_*` variables at build time (not runtime). To change backend URLs for a production deployment, rebuild with different build args or use a reverse proxy.

## Configuration

### Environment Variables (Build-Time)

Vite reads these only at **build time** — they're inlined into the bundle. Changing them requires rebuilding.

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_INGESTION_API_URL` | `http://localhost:8080` | Ingestion Service endpoint |
| `VITE_AI_ANALYSIS_API_URL` | `http://localhost:3000` | AI Analysis Service endpoint |
| `VITE_RISK_ENGINE_API_URL` | `http://localhost:8083` | Risk Engine Service endpoint |
| `VITE_REMEDIATION_API_URL` | `http://localhost:3001` | Remediation Service endpoint |
| `VITE_LEARNING_API_URL` | `http://localhost:3002` | Learning Service endpoint |

### Docker Build

```dockerfile
# From Dockerfile:
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm install && \
    npm run build \
      --build-arg VITE_INGESTION_API_URL=${INGESTION_URL} \
      --build-arg VITE_AI_ANALYSIS_API_URL=${AI_ANALYSIS_URL} \
      ...
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

## API Integration

The dashboard consumes all five backend services via REST APIs (using `fetch`):

### Ingestion Service (8080)
```javascript
GET /api/cves?page=0&size=20&severity=CRITICAL
GET /api/cves/{cveId}
POST /api/ingestion/trigger/NVD
GET /api/ingestion/logs/NVD
```

### AI Analysis Service (3000)
```javascript
GET /api/analysis?page=0&size=20&status=SUCCESS
GET /api/analysis/cve/{cveId}
POST /api/analysis/trigger
POST /api/analysis/cve/{cveId}  // sync analyze
```

### Risk Engine Service (8083)
```javascript
GET /api/risk?level=CRITICAL&page=0&size=20
GET /api/risk/{cveId}
POST /api/risk/trigger
POST /api/risk/{cveId}  // sync score
```

### Remediation Service (3001)
```javascript
GET /api/remediation?status=TICKET_CREATED&page=0&size=20
GET /api/remediation/cve/{cveId}
POST /api/remediation/trigger
POST /api/remediation/cve/{cveId}  // sync generate
```

### Learning Service (3002)
```javascript
GET /api/learning/report/latest
GET /api/feedback?type=RISK_ACCURACY  // for detail panel stats
POST /api/feedback  // submit rating
```

## Testing

### Unit Tests

```bash
npm test
```

Covers:
- **Format Utilities**: null handling, level normalization (string → enum), date parsing
- **Components**: SeverityBadge rendering, CveTable row selection, empty states, pagination
- **Filters**: state management, filter application, clearing

**No network/backend needed** — tests mock fetch responses.

### E2E Tests (Cypress, optional)

```bash
npm run test:e2e
```

Full user workflows:
- Navigate to Overview → click CRITICAL CVE → see detail panel
- Filter by severity → verify table updates
- Submit feedback → verify confirmation
- Etc.

## Monitoring & Observability

### Performance Metrics
- Page load: Target <1s (Vite + code-split bundles)
- API response: Track per-service latency (client-side timing)
- Component render: React DevTools Profiler (dev mode only)

### Error Tracking
- Catch failed fetches: red error banner, specific error message per service
- Log to browser console (dev) or error service (production)
- Example: "Ingestion API unavailable (unable to reach localhost:8080)"

### Browser DevTools
- **Network tab**: inspect each `/api/` call, see response status + timing
- **Console**: API errors logged with service name + error detail
- **React DevTools**: Component hierarchy, props, hooks

## Known Limitations & Future Work

### Phase 7 (Cloud Deployment)
- **CORS**: currently requires backend services to have CORS headers (fixed locally with CorsConfig)
- **Authentication**: no auth yet; Phase 7 adds OIDC/SSO (Okta, Keycloak, etc.)
- **Reverse proxy**: production may route all `/api/*` through one origin (ALB)

### Phase 8+ (Future)
- **Streaming results**: WebSocket for real-time metric updates (instead of polling)
- **Advanced filtering**: saved filter sets, search by CVE description
- **Trend analysis**: chart SLA performance over time, risk level distribution
- **Mobile support**: responsive design for tablets/phones

## Contributing

See main platform README. For dashboard specifically:
- All styling through `tokens.css` (no hardcoded colors/spacing)
- Component tests for visual regression (Storybook integration planned)
- Vite HMR enabled — save → instant reload

## Troubleshooting

### "Failed to fetch — some services didn't respond"
- Check CORS headers from backend services (should include `Access-Control-Allow-Origin: *` for local dev)
- Verify service URLs in `.env` match where services actually run
- Open browser DevTools → Console for specific error messages

### "Dashboard builds but shows blank page"
- Check `dist/index.html` exists (run `npm run build` again)
- Verify Vite build completed without errors: `npm run build 2>&1 | grep -i error`
- Check browser console for JavaScript errors

### "API calls timeout"
- Increase timeout in `api/*.js` files (default: 5s)
- Verify backend service is running: `curl http://localhost:8080/actuator/health`
- Check network latency: `curl -w "%{time_total}" http://localhost:8080/api/cves`
