import { useEffect, useMemo, useState } from 'react';
import { ingestionApi } from '../api/ingestionApi';
import { fixPrApi } from '../api/fixPrApi';
import { pushScanPrApi } from '../api/pushScanPrApi';
import { SeverityBadge } from '../components/SeverityBadge';
import { formatDate } from '../utils/format';

const KNOWN_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

function SeverityCell({ severity }) {
  if (!severity) return <span className="mono">—</span>;
  if (KNOWN_SEVERITIES.has(severity.toUpperCase())) {
    return <SeverityBadge level={severity.toUpperCase()} size="sm" />;
  }
  return <span className="scanner-findings-table__severity-unknown">{severity}</span>;
}

export function ScannerFindingsView() {
  const [state, setState] = useState({ loading: true, findings: [], error: null });
  const [form, setForm] = useState({ projectName: '', source: '' });
  const [scanState, setScanState] = useState({ running: false, result: null, error: null });

  const [pushForm, setPushForm] = useState({
    localPath: '', projectName: '', owner: '', repo: '', baseBranch: 'main', newBranchName: '', forcePush: false,
  });
  const [pushState, setPushState] = useState({ running: false, result: null, error: null });

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchForm, setBatchForm] = useState({ owner: '', repo: '', baseBranch: 'main', newBranchName: '' });
  const [batchState, setBatchState] = useState({ running: false, result: null, error: null });

  const [prHistory, setPrHistory] = useState({ loading: true, prs: [], error: null });

  function loadFindings() {
    setState((s) => ({ ...s, loading: true }));
    ingestionApi
      .listAllScannerFindings()
      .then((findings) => setState({ loading: false, findings: findings || [], error: null }))
      .catch((error) => setState({ loading: false, findings: [], error }));
  }

  function loadPrHistory() {
    setPrHistory((s) => ({ ...s, loading: true }));
    fixPrApi
      .listAll()
      .then((prs) => setPrHistory({ loading: false, prs: prs || [], error: null }))
      .catch((error) => setPrHistory({ loading: false, prs: [], error }));
  }

  useEffect(() => {
    loadFindings();
    loadPrHistory();
  }, []);

  const fixableFindings = useMemo(() => state.findings.filter((f) => f.fixedVersion), [state.findings]);
  const allFixableSelected = fixableFindings.length > 0 && fixableFindings.every((f) => selectedIds.has(f.id));

  async function handleScan(e) {
    e.preventDefault();
    if (!form.projectName.trim() || !form.source.trim()) return;

    setScanState({ running: true, result: null, error: null });
    try {
      const result = await ingestionApi.runScan(form.projectName.trim(), form.source.trim());
      setScanState({ running: false, result, error: null });
      loadFindings();
    } catch (error) {
      setScanState({ running: false, result: null, error });
    }
  }

  async function handlePushScanPr(e) {
    e.preventDefault();
    if (!pushForm.localPath.trim() || !pushForm.projectName.trim() || !pushForm.owner.trim() || !pushForm.repo.trim()) return;

    setPushState({ running: true, result: null, error: null });
    try {
      const result = await pushScanPrApi.run({
        localPath: pushForm.localPath.trim(),
        projectName: pushForm.projectName.trim(),
        owner: pushForm.owner.trim(),
        repo: pushForm.repo.trim(),
        baseBranch: pushForm.baseBranch.trim() || 'main',
        newBranchName: pushForm.newBranchName.trim() || undefined,
        forcePush: pushForm.forcePush,
      });
      setPushState({ running: false, result, error: null });
      loadFindings();
      loadPrHistory();
    } catch (error) {
      setPushState({ running: false, result: null, error });
    }
  }

  function toggleSelected(findingId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  }

  function toggleSelectAllFixable() {
    setSelectedIds(allFixableSelected ? new Set() : new Set(fixableFindings.map((f) => f.id)));
  }

  async function handleBatchCreatePr(e) {
    e.preventDefault();
    if (!batchForm.owner.trim() || !batchForm.repo.trim() || selectedIds.size === 0) return;

    setBatchState({ running: true, result: null, error: null });
    try {
      const result = await ingestionApi.createBatchFixPr(Array.from(selectedIds), {
        owner: batchForm.owner.trim(),
        repo: batchForm.repo.trim(),
        baseBranch: batchForm.baseBranch.trim() || 'main',
        newBranchName: batchForm.newBranchName.trim() || undefined,
      });
      setBatchState({ running: false, result, error: null });
      setSelectedIds(new Set());
      loadPrHistory();
    } catch (error) {
      setBatchState({ running: false, result: null, error });
    }
  }

  return (
    <div className="scanner-findings-view">
      <h1>Scanner Findings</h1>
      <p className="view-subtitle">
        CVEs found by scanning your own projects (Trivy) - shown immediately after a scan
        completes, independent of whether analysis or risk scoring has run yet on these CVEs.
      </p>

      <form className="card scanner-findings-view__form scanner-findings-view__form--highlight" onSubmit={handlePushScanPr}>
        <h3 className="scanner-findings-view__form-title">Push, scan &amp; create PR (one step)</h3>
        <p className="scanner-findings-view__form-hint scanner-findings-view__form-hint--top">
          Pushes the local project to GitHub, scans it, and opens one PR for everything fixable - all
          in one call. "GitHub owner" and "Repo" are just names (e.g. <span className="mono">kamini1007</span> and{' '}
          <span className="mono">Dummy_project_1</span>) - not the full https:// URL. Requires GITHUB_TOKEN
          configured on ingestion-service.
        </p>
        <div className="scanner-findings-view__form-row">
          <label>
            Local path
            <input
              type="text"
              value={pushForm.localPath}
              onChange={(e) => setPushForm((f) => ({ ...f, localPath: e.target.value }))}
              placeholder="D:\demo-vuln-projects\java-legacy-service"
              disabled={pushState.running}
              required
            />
          </label>
          <label>
            Project name
            <input
              type="text"
              value={pushForm.projectName}
              onChange={(e) => setPushForm((f) => ({ ...f, projectName: e.target.value }))}
              placeholder="java-legacy-service"
              disabled={pushState.running}
              required
            />
          </label>
          <label>
            GitHub owner
            <input
              type="text"
              value={pushForm.owner}
              onChange={(e) => setPushForm((f) => ({ ...f, owner: e.target.value }))}
              placeholder="kamini1007"
              disabled={pushState.running}
              required
            />
          </label>
          <label>
            Repo <span className="scanner-findings-view__optional">(name only, not a URL)</span>
            <input
              type="text"
              value={pushForm.repo}
              onChange={(e) => setPushForm((f) => ({ ...f, repo: e.target.value }))}
              placeholder="Dummy_project_1"
              disabled={pushState.running}
              required
            />
          </label>
          <label>
            Base branch
            <input
              type="text"
              value={pushForm.baseBranch}
              onChange={(e) => setPushForm((f) => ({ ...f, baseBranch: e.target.value }))}
              disabled={pushState.running}
            />
          </label>
          <label>
            New branch name
            <input
              type="text"
              value={pushForm.newBranchName}
              onChange={(e) => setPushForm((f) => ({ ...f, newBranchName: e.target.value }))}
              placeholder="optional - auto-generated if blank"
              disabled={pushState.running}
            />
          </label>
          <button type="submit" className="button button--primary" disabled={pushState.running}>
            {pushState.running ? 'Working…' : 'Push, Scan & Create PR'}
          </button>
        </div>

        <label className="scanner-findings-view__force-push-label">
          <input
            type="checkbox"
            checked={pushForm.forcePush}
            onChange={(e) => setPushForm((f) => ({ ...f, forcePush: e.target.checked }))}
            disabled={pushState.running}
          />
          Force push (overwrites the remote repo's history to match this local copy exactly - only
          use this if you're sure there's nothing valuable on the remote you'd lose, e.g. a fresh
          repo GitHub auto-initialized with just a README)
        </label>

        {pushState.running && (
          <div className="scanner-findings-view__scanning">
            In progress - pushing, scanning, and opening a PR can take up to a couple of minutes…
          </div>
        )}
        {pushState.result && (
          <div className="scanner-findings-view__success">
            <p>
              {pushState.result.cvesFound} CVE(s) found, {pushState.result.fixableFindings} fixable.
            </p>
            {pushState.result.pr ? (
              <>
                <p>
                  <a href={pushState.result.pr.prUrl} target="_blank" rel="noreferrer">
                    PR #{pushState.result.pr.prNumber} opened ↗
                  </a>
                  {' — branch '}
                  <span className="mono">{pushState.result.pr.branchName}</span>
                </p>
                <ul className="scanner-findings-view__batch-included">
                  {pushState.result.pr.included.map((item) => (
                    <li key={`${item.cveId}-${item.packageName}`}>
                      {item.cveId}: {item.packageName} {item.oldVersion} → {item.newVersion} ({item.manifestPath})
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No fixable findings, so no PR was opened.</p>
            )}
          </div>
        )}
        {pushState.error && (
          <div className="error-banner">{pushState.error.message}</div>
        )}
      </form>

      <form className="card scanner-findings-view__form" onSubmit={handleScan}>
        <h3 className="scanner-findings-view__form-title">Scan a project (scan only)</h3>
        <div className="scanner-findings-view__form-row">
          <label>
            Project name
            <input
              type="text"
              value={form.projectName}
              onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
              placeholder="my-other-project"
              disabled={scanState.running}
              required
            />
          </label>
          <label>
            GitHub URL or local path
            <input
              type="text"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              placeholder="https://github.com/owner/repo or D:\path\to\project"
              disabled={scanState.running}
              required
            />
          </label>
          <button type="submit" className="button" disabled={scanState.running}>
            {scanState.running ? 'Scanning…' : 'Run scan'}
          </button>
        </div>
        <p className="scanner-findings-view__form-hint">
          Runs Trivy on the machine hosting ingestion-service. GitHub URLs must look like
          https://github.com/owner/repo. Large repos can take a couple of minutes.
        </p>

        {scanState.running && (
          <div className="scanner-findings-view__scanning">Scan in progress - this can take a minute or two…</div>
        )}
        {scanState.result && (
          <div className="scanner-findings-view__success">
            Scan complete: {scanState.result.cvesUpserted} CVE(s) found, {scanState.result.skippedNonCve} non-CVE
            advisories skipped.
          </div>
        )}
        {scanState.error && (
          <div className="error-banner">Scan failed: {scanState.error.message}</div>
        )}
      </form>

      {state.loading && <div className="scanner-findings-view__loading">Loading…</div>}
      {state.error && (
        <div className="error-banner">Couldn't load scanner findings: {state.error.message}</div>
      )}

      {!state.loading && !state.error && state.findings.length === 0 && (
        <div className="card scanner-findings-view__empty">
          <p>No scanner findings yet. Run a scan above to get started.</p>
        </div>
      )}

      {!state.loading && !state.error && state.findings.length > 0 && (
        <div className="card scanner-findings-view__table-wrap">
          <table className="scanner-findings-table">
            <thead>
              <tr>
                <th className="scanner-findings-table__checkbox-col">
                  <input
                    type="checkbox"
                    checked={allFixableSelected}
                    onChange={toggleSelectAllFixable}
                    disabled={fixableFindings.length === 0}
                    title="Select all fixable findings"
                  />
                </th>
                <th>Project</th>
                <th>CVE</th>
                <th>Severity</th>
                <th>Package</th>
                <th>Installed</th>
                <th>Fix available</th>
                <th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {state.findings.map((f) => (
                <tr key={`${f.cveId}-${f.projectName}-${f.packageName}`} className={selectedIds.has(f.id) ? 'scanner-findings-table__row--selected' : ''}>
                  <td className="scanner-findings-table__checkbox-col">
                    {f.fixedVersion && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleSelected(f.id)}
                      />
                    )}
                  </td>
                  <td>{f.projectName}</td>
                  <td className="mono">{f.cveId}</td>
                  <td><SeverityCell severity={f.severity} /></td>
                  <td className="mono">{f.packageName}</td>
                  <td className="mono">{f.installedVersion || '—'}</td>
                  <td className="mono scanner-findings-table__fixed">{f.fixedVersion || '—'}</td>
                  <td>{formatDate(f.scannedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedIds.size > 0 && (
        <form className="card scanner-findings-view__batch-form" onSubmit={handleBatchCreatePr}>
          <div className="scanner-findings-view__batch-header">
            <h3 className="scanner-findings-view__form-title">
              Create PR for {selectedIds.size} selected finding{selectedIds.size === 1 ? '' : 's'}
            </h3>
            <button
              type="button"
              className="scanner-findings-view__clear-link"
              onClick={() => setSelectedIds(new Set())}
              disabled={batchState.running}
            >
              Clear selection
            </button>
          </div>

          <div className="scanner-findings-view__form-row scanner-findings-view__form-row--batch">
            <label>
              GitHub owner
              <input
                type="text"
                value={batchForm.owner}
                onChange={(e) => setBatchForm((b) => ({ ...b, owner: e.target.value }))}
                placeholder="kamini1007"
                disabled={batchState.running}
                required
              />
            </label>
            <label>
              Repo
              <input
                type="text"
                value={batchForm.repo}
                onChange={(e) => setBatchForm((b) => ({ ...b, repo: e.target.value }))}
                placeholder="my-repo"
                disabled={batchState.running}
                required
              />
            </label>
            <label>
              Base branch
              <input
                type="text"
                value={batchForm.baseBranch}
                onChange={(e) => setBatchForm((b) => ({ ...b, baseBranch: e.target.value }))}
                disabled={batchState.running}
              />
            </label>
            <label>
              New branch name
              <input
                type="text"
                value={batchForm.newBranchName}
                onChange={(e) => setBatchForm((b) => ({ ...b, newBranchName: e.target.value }))}
                placeholder="optional - auto-generated if blank"
                disabled={batchState.running}
              />
            </label>
            <button type="submit" className="button button--primary" disabled={batchState.running}>
              {batchState.running ? 'Creating PR…' : 'Create PR'}
            </button>
          </div>

          <p className="scanner-findings-view__form-hint">
            One PR, one branch, covering every selected finding - each finding's own manifest file
            is bumped automatically. Findings sharing a file get combined into one commit; findings
            in different files each get their own commit, same PR.
          </p>

          {batchState.result && (
            <div className="scanner-findings-view__success">
              <p>
                <a href={batchState.result.prUrl} target="_blank" rel="noreferrer">
                  PR #{batchState.result.prNumber} opened ↗
                </a>
                {' — '}
                branch <span className="mono">{batchState.result.branchName}</span>
                {' — '}
                {batchState.result.included.length} fix{batchState.result.included.length === 1 ? '' : 'es'} included
              </p>
              <ul className="scanner-findings-view__batch-included">
                {batchState.result.included.map((item) => (
                  <li key={`${item.cveId}-${item.packageName}`}>
                    {item.cveId}: {item.packageName} {item.oldVersion} → {item.newVersion} ({item.manifestPath})
                  </li>
                ))}
              </ul>
              {batchState.result.skipped.length > 0 && (
                <>
                  <p className="scanner-findings-view__batch-skipped-title">Not included:</p>
                  <ul className="scanner-findings-view__batch-skipped">
                    {batchState.result.skipped.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {batchState.error && (
            <div className="error-banner">{batchState.error.message}</div>
          )}
        </form>
      )}

      <h2 className="scanner-findings-view__section-title">Fix PR history</h2>
      <p className="view-subtitle">
        Every GitHub pull request created above, bumping vulnerable dependencies to their fixed versions.
      </p>

      {prHistory.loading && <div className="scanner-findings-view__loading">Loading…</div>}
      {prHistory.error && (
        <div className="error-banner">Couldn't load fix PR history: {prHistory.error.message}</div>
      )}

      {!prHistory.loading && !prHistory.error && prHistory.prs.length === 0 && (
        <div className="card scanner-findings-view__empty">
          <p>No fix PRs created yet.</p>
        </div>
      )}

      {!prHistory.loading && !prHistory.error && prHistory.prs.length > 0 && (
        <div className="card scanner-findings-view__table-wrap">
          <table className="scanner-findings-table">
            <thead>
              <tr>
                <th>CVE</th>
                <th>Repo</th>
                <th>Package</th>
                <th>Change</th>
                <th>PR</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {prHistory.prs.map((pr) => (
                <tr key={pr.id}>
                  <td className="mono">{pr.cveId}</td>
                  <td>{pr.owner}/{pr.repo}</td>
                  <td className="mono">{pr.packageName}</td>
                  <td className="mono">
                    {pr.oldVersion} <span className="fix-prs-table__arrow">→</span>{' '}
                    <span className="fix-prs-table__new-version">{pr.newVersion}</span>
                  </td>
                  <td>
                    <a href={pr.prUrl} target="_blank" rel="noreferrer">
                      #{pr.prNumber} ↗
                    </a>
                  </td>
                  <td>{formatDate(pr.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
