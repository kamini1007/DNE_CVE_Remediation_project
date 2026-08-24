import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.ingestion;

export const pushScanPrApi = {
  run: ({ localPath, projectName, owner, repo, baseBranch, newBranchName, forcePush }) =>
    apiFetch(base, `/api/ingestion/scanner-findings/push-scan-and-pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localPath, projectName, owner, repo, baseBranch, newBranchName, forcePush }),
    }),
};
