import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.ingestion;

export const fixPrApi = {
  listAll: () => apiFetch(base, `/api/ingestion/fix-prs`),
};
