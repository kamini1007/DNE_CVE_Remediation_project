import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.remediation;

export const remediationApi = {
  getRemediation: (cveId) => apiFetch(base, `/api/remediation/cve/${cveId}`),
  listRemediations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(base, `/api/remediation${query ? `?${query}` : ''}`);
  },
  triggerBatch: (batchSize) =>
    apiFetch(base, '/api/remediation/trigger', {
      method: 'POST',
      body: JSON.stringify(batchSize ? { batchSize } : {}),
    }),
  remediateCveNow: (cveId) => apiFetch(base, `/api/remediation/cve/${cveId}`, { method: 'POST' }),
};
