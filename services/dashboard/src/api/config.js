/**
 * Backend base URLs.
 *
 * Two deployment topologies are supported:
 *
 * 1. **Local dev** (`npm run dev`): dashboard on :5173, services on their own
 *    ports. Different origins, so full absolute URLs are needed - these are
 *    the fallback defaults below.
 *
 * 2. **Deployed behind the ingress** (Phase 7): everything is served from one
 *    hostname, with the ALB routing /api/* to the right service. The build
 *    passes these vars as empty strings, making every request same-origin and
 *    relative - which sidesteps CORS entirely rather than having each service
 *    maintain its own CORS allowlist.
 *
 * An explicitly-set empty string therefore means "same origin" and must be
 * honored, so this checks whether the var is *defined* rather than truthy -
 * `|| 'http://localhost:8080'` would incorrectly override an intentional ''.
 */
function resolveBaseUrl(configured, devFallback) {
  return configured === undefined ? devFallback : configured;
}

export const API_BASE_URLS = {
  ingestion: resolveBaseUrl(import.meta.env.VITE_INGESTION_API_URL, 'http://localhost:8080'),
  analysis: resolveBaseUrl(import.meta.env.VITE_AI_ANALYSIS_API_URL, 'http://localhost:3000'),
  risk: resolveBaseUrl(import.meta.env.VITE_RISK_ENGINE_API_URL, 'http://localhost:8083'),
  remediation: resolveBaseUrl(import.meta.env.VITE_REMEDIATION_API_URL, 'http://localhost:3001'),
  learning: resolveBaseUrl(import.meta.env.VITE_LEARNING_API_URL, 'http://localhost:3002'),
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApiError(`${options.method || 'GET'} ${path} failed: ${response.status} ${body}`.trim(), response.status);
  }

  if (response.status === 204) return null;
  return response.json();
}
