import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.analysis;

export const analysisApi = {
  getAnalysis: (cveId) => apiFetch(base, `/api/analysis/cve/${cveId}`),
  triggerBatch: (batchSize) =>
    apiFetch(base, '/api/analysis/trigger', {
      method: 'POST',
      body: JSON.stringify(batchSize ? { batchSize } : {}),
    }),
  analyzeCveNow: (cveId) => apiFetch(base, `/api/analysis/cve/${cveId}`, { method: 'POST' }),
};
