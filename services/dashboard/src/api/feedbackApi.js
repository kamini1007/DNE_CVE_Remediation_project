import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.learning;

export const feedbackApi = {
  submit: (feedback) => apiFetch(base, '/api/feedback', { method: 'POST', body: JSON.stringify(feedback) }),
  listForCve: (cveId) => apiFetch(base, `/api/feedback/cve/${cveId}`),
};
