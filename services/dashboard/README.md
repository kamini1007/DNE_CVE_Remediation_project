# Dashboard (Phase 6)

React + Vite single-page app that pulls the whole pipeline into one view:
ingested CVEs, AI analysis, risk scores, and remediation status/Jira links.

## Design

A dark ops-console aesthetic, built around one signature element: **the
severity ramp**. Every place a risk, exploitability, or severity level
appears — table row signal bars, badges, detail headlines — uses the same
five-color scale (`--severity-low` through `--severity-critical`), so the eye
learns it once and reads it everywhere. The interactive accent (blue) is
deliberately outside that ramp so a clickable control can never be misread as
a risk signal.

Type is IBM Plex Sans with IBM Plex Mono for all identifiers and numbers —
CVE IDs, scores, and timestamps are tabular data, and monospace with
`tabular-nums` keeps columns scannable. Tokens live in
`src/styles/tokens.css`; every color and spacing value derives from there.

## Views

- **Overview** — leads with what needs attention (CRITICAL/HIGH counts,
  highest-risk CVEs) rather than total-ingested vanity metrics, plus pipeline
  controls to trigger each stage on demand.
- **CVE Explorer** — every risk-scored CVE, filterable by level, paginated.
- **Detail panel** — opens for any selected CVE and fetches from all four
  original services in parallel. Each section degrades independently: a CVE
  that hasn't been analyzed or scored yet shows "not yet analyzed" for that
  section rather than erroring the whole panel, since partial pipeline
  progress is the normal state, not a failure. The AI analysis and risk score
  sections each have a star-rating feedback widget (Phase 8) feeding
  learning-service's calibration reports.
- **Continuous Learning** — the latest calibration report: per-risk-level and
  per-prompt-version stats, plus recommendations. Deliberately read-only, no
  "apply" button - every recommendation requires a human to go make the
  change themselves, matching learning-service's own design.

## Configuration

Backend URLs come from `VITE_*` env vars (see `.env.example`). **Vite inlines
these at build time**, not runtime — so in Docker/k8s they're build args
(see the `Dockerfile`), and changing an API URL means rebuilding the image,
not just restarting the container.

| Variable | Default |
|---|---|
| `VITE_INGESTION_API_URL` | `http://localhost:8080` |
| `VITE_AI_ANALYSIS_API_URL` | `http://localhost:3000` |
| `VITE_RISK_ENGINE_API_URL` | `http://localhost:8081` |
| `VITE_REMEDIATION_API_URL` | `http://localhost:3001` |
| `VITE_LEARNING_API_URL` | `http://localhost:3002` |

## Running locally

```bash
npm install
cp .env.example .env    # adjust if your services aren't on the default ports
npm run dev             # http://localhost:5173
```

The backend services need CORS enabled for the dashboard's origin. They
currently don't set CORS headers — see "Known gaps" below.

## Testing

```bash
npm test
```

Covers the format utilities (null-handling, level normalization) and the
`SeverityBadge`/`CveTable` components (label rendering, unknown-level
fallback, row selection, empty state). No network or backend needed.

## Known gaps

- **CORS isn't configured on the backend services yet.** Running the
  dashboard on `:5173` against services on `:8080`/`:3000`/`:8081`/`:3001`
  will hit CORS errors until either (a) the services add CORS headers for the
  dashboard origin, or (b) everything is served behind one origin via an
  Ingress. This is a Phase 7 concern (it's really an ingress/deployment
  topology decision), but worth knowing before you try to run it end-to-end
  locally.
- **No authentication.** Anyone who can reach the dashboard can trigger
  pipeline runs. Fine for a local/dev cluster; needs auth before any real
  exposure — also Phase 7.
- **The Overview's "tickets created" counters** fetch up to 100 remediation
  records and count client-side. Fine at current scale; would want a proper
  server-side aggregate endpoint if remediation volume grows.

## What's next (Phase 7)

Cloud deployment and monitoring: ingress + TLS, CORS/auth resolution,
centralized logging, metrics, alerting, and security controls.
