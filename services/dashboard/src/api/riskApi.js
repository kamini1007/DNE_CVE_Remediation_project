import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.risk;

export const riskApi = {
  listPrioritized: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(base, `/api/risk${query ? `?${query}` : ''}`);
  },
  getRiskScore: (cveId) => apiFetch(base, `/api/risk/${cveId}`),
  triggerBatch: (batchSize) => apiFetch(base, `/api/risk/trigger${batchSize ? `?batchSize=${batchSize}` : ''}`, { method: 'POST' }),
  listAssetProfiles: () => apiFetch(base, '/api/asset-profiles'),
  createAssetProfile: (profile) => apiFetch(base, '/api/asset-profiles', { method: 'POST', body: JSON.stringify(profile) }),
};
