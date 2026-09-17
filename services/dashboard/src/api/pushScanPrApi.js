import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.ingestion;

export const pushScanPrApi = {
  // source: a real local folder path, OR a GitHub URL - the backend
  // detects which and skips pushing when it's already a GitHub URL.
  run: ({ source, projectName, owner, repo, baseBranch, newBranchName, forcePush }) =>
    apiFetch(base, `/api/ingestion/scanner-findings/push-scan-and-pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, projectName, owner, repo, baseBranch, newBranchName, forcePush }),
    }),
};
