import { apiFetch, API_BASE_URLS } from './config';

const base = API_BASE_URLS.ingestion;

export const ingestionApi = {
  listCves: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(base, `/api/cves${query ? `?${query}` : ''}`);
  },
  getCve: (cveId) => apiFetch(base, `/api/cves/${cveId}`),
  triggerIngestion: (source) => apiFetch(base, `/api/ingestion/trigger/${source}`, { method: 'POST' }),
  getIngestionLogs: (source) => apiFetch(base, `/api/ingestion/logs/${source}`),
  getScannerFindings: (cveId) => apiFetch(base, `/api/ingestion/scanner-findings/cve/${cveId}`),
  listAllScannerFindings: () => apiFetch(base, `/api/ingestion/scanner-findings`),
  listScannerFindingsForProject: (projectName) =>
    apiFetch(base, `/api/ingestion/scanner-findings/project/${encodeURIComponent(projectName)}`),
  runScan: (projectName, source) =>
    apiFetch(base, `/api/ingestion/scanner-findings/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, source }),
    }),
  createFixPr: (findingId, { owner, repo, baseBranch, manifestPath, newBranchName }) =>
    apiFetch(base, `/api/ingestion/scanner-findings/${findingId}/create-pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, baseBranch, manifestPath, newBranchName }),
    }),
  createBatchFixPr: (findingIds, { owner, repo, baseBranch, newBranchName }) =>
    apiFetch(base, `/api/ingestion/scanner-findings/batch-create-pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingIds, owner, repo, baseBranch, newBranchName }),
    }),
};
