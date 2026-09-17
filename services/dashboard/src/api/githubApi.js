import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.ingestion;

export const githubApi = {
  // Real branch names for a repo - used to populate the base-branch dropdown.
  listBranches: (owner, repo) =>
    apiFetch(base, `/api/ingestion/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`),
};
