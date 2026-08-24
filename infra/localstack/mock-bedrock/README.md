# mock-bedrock

A tiny Express server that implements just enough of AWS Bedrock's
`InvokeModel` HTTP contract (`POST /model/{modelId}/invoke`, Anthropic
Messages API request/response shape) for **ai-analysis-service to run fully
offline** - no AWS account, no real credentials, no network access required.

## What it is

- A drop-in target for `ai-analysis-service`'s `BEDROCK_ENDPOINT_URL` env var.
  `bedrockClient.js` needs zero code changes to talk to this instead of real
  Bedrock - it's the same AWS SDK client, just pointed at a different endpoint.
- Heuristic, CVSS-aware fake output (see `src/responseGenerator.js`): a CVE
  with a CVSS score of 9.8 in the prompt reliably comes back `CRITICAL` here,
  a 2.0 comes back `LOW`, etc. - enough signal-following behavior that batch
  runs, risk scoring, and the eventual dashboard all have *some* variation to
  display, rather than one fixed canned response for every CVE.
- Every field in the fake response is prefixed `[mock-bedrock]` so it can
  never be mistaken for real AI output if it ever leaked into a real
  environment by mistake.

## What it is NOT

- **Not real AI.** It does not call any language model. `exploitabilityLevel`
  is a simple CVSS-score bucket; `remediationRecommendations` are canned
  strings. Use it for exercising the ingestion → analysis → risk-scoring
  pipeline end-to-end, not for evaluating analysis quality.
- **Not a general Bedrock emulator.** It only implements the one endpoint
  shape `ai-analysis-service` actually calls. It will not work as a drop-in
  for other Bedrock API calls (e.g. `ListFoundationModels`).

## Running it

```bash
cd infra/localstack/mock-bedrock
npm install
npm test
npm start   # listens on :4010
```

Then point ai-analysis-service at it:
```bash
BEDROCK_ENDPOINT_URL=http://localhost:4010 npm run dev   # from services/ai-analysis-service
```

Or via Docker Compose - see `docs/localstack-guide.md` at the repo root for
the full offline end-to-end setup (Postgres + all three backend services +
this mock, no AWS account needed at all).
