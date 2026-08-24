import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.ingestion;

export const pipelineHealthApi = {
  getHealth: () => apiFetch(base, `/api/pipeline/health`),
};
