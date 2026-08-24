import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.learning;

export const learningApi = {
  getLatestReport: () => apiFetch(base, '/api/learning/report/latest'),
  triggerReport: () => apiFetch(base, '/api/learning/report/trigger', { method: 'POST' }),
};
