# Fix: dashboard "Failed to fetch" — CORS

Fixes the error banner: *"Some services didn't respond... Failed to fetch"*
when the dashboard (`localhost:5173`) tries to call any backend service
(`8080`, `3000`, `8081`, `3001`, `3002`) running locally.

## Root cause

Each backend service runs on its own port in local dev. Browsers block
cross-origin `fetch()` calls unless the *server* explicitly sends CORS
headers permitting it - none of these services did, since the original CORS
plan was "route everything through one ALB origin in production," which
doesn't apply to how you're running things locally. This was a known,
documented gap (see the dashboard's own README, "Known gaps") that needed an
actual local-dev fix, not just a Phase 7 production workaround.

## Where each file goes

```
services/ingestion-service/src/main/java/com/security/cveingestion/config/
└── CorsConfig.java                    ← NEW FILE

services/risk-engine-service/src/main/java/com/security/riskengine/config/
└── CorsConfig.java                    ← NEW FILE

services/ai-analysis-service/src/
└── app.js                             ← REPLACE

services/remediation-service/src/
└── app.js                             ← REPLACE

services/learning-service/src/
└── app.js                             ← REPLACE
```

**Important - the three `app.js` replacements are reconstructed from our
conversation history, not diffed against your actual current files** (no
access to your live project in this session). Each only adds two lines
(`const cors = require('cors')` and `app.use(cors(...))`) plus one explanatory
comment - if you've made other local edits to these files, it's safer to add
those two lines by hand to your real file than to paste this over it blind.

The two Java `CorsConfig.java` files are new, so there's no overwrite risk
there.

## One more step — install the `cors` package

The three Node `app.js` files now `require('cors')`, which isn't installed
yet. Rather than hand-edit `package.json` (which I can't safely diff against
your actual file either), just install it directly - `npm` will update
`package.json` and the lockfile correctly on its own:

```powershell
cd services\ai-analysis-service
npm install cors

cd ..\remediation-service
npm install cors

cd ..\learning-service
npm install cors
```

## Verify

Restart all five backend services (the two Java ones need a full
`mvn spring-boot:run` restart to pick up the new `@Configuration` class; the
three Node ones need a restart since nodemon/`node` won't pick up a new
dependency without one). Then reload the dashboard at `localhost:5173` - the
red error banner should be gone, and Overview should start showing real
numbers instead of dashes once you've triggered the pipeline.

If you still see errors after this, open Chrome DevTools (F12) → Console and
check the exact message - if it no longer says anything about CORS, any
remaining "Failed to fetch" is just that particular service not being started
yet, not this issue.
