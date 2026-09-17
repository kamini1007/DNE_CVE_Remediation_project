import { useEffect, useState } from 'react';
import { ingestionApi } from '../api/ingestionApi';
import { fixPrApi } from '../api/fixPrApi';
import { pushScanPrApi } from '../api/pushScanPrApi';
import { githubApi } from '../api/githubApi';
import { analysisApi } from '../api/analysisApi';
import { riskApi } from '../api/riskApi';
import { remediationApi } from '../api/remediationApi';
import { pipelineHealthApi } from '../api/pipelineHealthApi';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatCard } from '../components/StatCard';
import { formatDate } from '../utils/format';

const KNOWN_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

// Matches https://github.com/owner/repo, with or without a trailing
// .git/slash/extra path segments.
const GITHUB_URL_PATTERN = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i;

// Default push destination when the source is a local path (no other way
// to know where to push it) - change this if the demo account changes.
const DEFAULT_GITHUB_OWNER = 'kamini1007';

function SeverityCell({ severity }) {
  if (!severity) return <span className="mono">—</span>;
  if (KNOWN_SEVERITIES.has(severity.toUpperCase())) {
    return <SeverityBadge level={severity.toUpperCase()} size="sm" />;
  }
  return <span className="scanner-findings-table__severity-unknown">{severity}</span>;
}

/** Derives a project name from the source - repo name for a GitHub URL, last folder segment for a local path. */
function deriveProjectName(source) {
  const trimmed = source.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith('http')) {
    const match = trimmed.match(GITHUB_URL_PATTERN);
    return match ? match[2] : trimmed;
  }
  const segments = trimmed.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] || trimmed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilStable(selector, { maxAttempts = 20, intervalMs = 2000 } = {}) {
  let previous = null;
  let stableCount = 0;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    let health;
    try {
      health = await pipelineHealthApi.getHealth();
    } catch {
      continue;
    }
    const current = selector(health);
    if (previous !== null && current === previous) {
      stableCount += 1;
      if (stableCount >= 2) return current;
    } else {
      stableCount = 0;
    }
    previous = current;
  }
  return previous;
}

function useApiOnce(fetchFn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetchFn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function ScannerFindingsView() {
  const [state, setState] = useState({ loading: true, findings: [], error: null });
  const [form, setForm] = useState({ projectName: '', source: '' });
  const [scanState, setScanState] = useState({ running: false, result: null, error: null });

  // No "projectName", "owner", or "repo" input state here anymore - all
  // three are derived from source (see deriveProjectName and
  // handleSourceBlur) rather than typed in.
  const [pushForm, setPushForm] = useState({
    source: '', owner: DEFAULT_GITHUB_OWNER, repo: '', baseBranch: 'main', newBranchName: '', forcePush: false,
  });
  const [pushState, setPushState] = useState({ running: false, result: null, error: null });
  const [postScanRun, setPostScanRun] = useState(null);

  const [prHistory, setPrHistory] = useState({ loading: true, prs: [], error: null });
  const [refreshKey, setRefreshKey] = useState(0);

  const sourceIsGitHubUrl = pushForm.source.trim().toLowerCase().startsWith('http');

  const [branches, setBranches] = useState({ loading: false, list: [], error: null });

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

  const ticketsQuery = useApiOnce(() => remediationApi.listRemediations({ status: 'TICKET_CREATED', size: 1 }), [refreshKey]);
  const playbooksQuery = useApiOnce(() => remediationApi.listRemediations({ size: 1 }), [refreshKey]);

  function refreshEverything() {
    setRefreshKey((k) => k + 1);
  }

  /**
   * Derives owner/repo the moment the source field is filled in - for a
   * GitHub URL, both come from the URL itself (the actual source of
   * truth). For a local path, repo is derived from the folder name (same
   * logic as deriveProjectName) and owner is always the hardcoded
   * default, since a local path carries no information about where to
   * push it.
   */
  function handleSourceBlur() {
    const trimmed = pushForm.source.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase().startsWith('http')) {
      const match = trimmed.match(GITHUB_URL_PATTERN);
      if (match) {
        const [, parsedOwner, parsedRepo] = match;
        setPushForm((f) => ({ ...f, owner: parsedOwner, repo: parsedRepo }));
        fetchBranches(parsedOwner, parsedRepo);
      }
    } else {
      const derivedRepo = deriveProjectName(trimmed);
      setPushForm((f) => ({ ...f, owner: DEFAULT_GITHUB_OWNER, repo: derivedRepo }));
      if (derivedRepo) {
        fetchBranches(DEFAULT_GITHUB_OWNER, derivedRepo);
      }
    }
  }

  async function fetchBranches(owner, repo) {
    setBranches({ loading: true, list: [], error: null });
    try {
      const result = await githubApi.listBranches(owner, repo);
      setBranches({ loading: false, list: result.branches || [], error: null });
      if (result.branches?.length && !result.branches.includes(pushForm.baseBranch)) {
        const preferred = result.branches.find((b) => b === 'main' || b === 'master') || result.branches[0];
        setPushForm((f) => ({ ...f, baseBranch: preferred }));
      }
    } catch (error) {
      setBranches({ loading: false, list: [], error });
    }
  }

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

  async function runPostScanChain() {
    const steps = [
      { key: 'analysis', label: 'AI analysis', description: 'Explaining exploitability/impact for the newly-scanned CVEs.', status: 'pending' },
      { key: 'riskScoring', label: 'Risk scoring', description: 'Calculating a weighted risk score for each.', status: 'pending' },
    ];
    setPostScanRun({ steps, running: true, error: null });

    function update(key, patch) {
      setPostScanRun((s) => (s ? { ...s, steps: s.steps.map((st) => (st.key === key ? { ...st, ...patch } : st)) } : s));
    }

    try {
      update('analysis', { status: 'running' });
      await analysisApi.triggerBatch();
      await pollUntilStable((h) => h.analysis.notYetAnalyzed);
      update('analysis', { status: 'done' });

      update('riskScoring', { status: 'running' });
      await riskApi.triggerBatch();
      await pollUntilStable((h) => h.riskScoring.notYetScored);
      update('riskScoring', { status: 'done' });
    } catch (err) {
      setPostScanRun((s) => (s ? { ...s, error: err.message } : s));
    } finally {
      setPostScanRun((s) => (s ? { ...s, running: false } : s));
      refreshEverything();
    }
  }

  async function handlePushScanPr(e) {
    e.preventDefault();
    const owner = sourceIsGitHubUrl ? pushForm.owner.trim() : DEFAULT_GITHUB_OWNER;
    const projectName = deriveProjectName(pushForm.source);
    const repo = pushForm.repo.trim() || deriveProjectName(pushForm.source);
    if (!pushForm.source.trim() || !projectName || !owner || !repo) return;

    setPushState({ running: true, result: null, error: null });
    setPostScanRun(null);
    try {
      const result = await pushScanPrApi.run({
        source: pushForm.source.trim(),
        projectName,
        owner,
        repo,
        baseBranch: pushForm.baseBranch.trim() || 'main',
        newBranchName: pushForm.newBranchName.trim() || undefined,
        forcePush: sourceIsGitHubUrl ? false : pushForm.forcePush,
      });
      setPushState({ running: false, result, error: null });
      loadFindings();
      loadPrHistory();
      refreshEverything();
      if (result.cvesFound > 0) {
        runPostScanChain();
      }
    } catch (error) {
      setPushState({ running: false, result: null, error });
    }
  }

  return (
    <div className="scanner-findings-view">
      <h1>Scanner Findings</h1>
      <p className="view-subtitle">
        Scan a project, file one Jira ticket for it, and open a fix PR that references that ticket - all in one place.
      </p>

      <div className="stats-grid stats-grid--compact">
        <StatCard label="Tickets created" value={ticketsQuery.data?.totalElements ?? '—'} sublabel="In Jira" />
        <StatCard label="Playbooks ready" value={playbooksQuery.data?.totalElements ?? '—'} sublabel="Awaiting Jira config" />
      </div>

      <form className="card scanner-findings-view__form scanner-findings-view__form--highlight" onSubmit={handlePushScanPr}>
        <h3 className="scanner-findings-view__form-title">Push, scan, file Jira ticket &amp; open PR (full pipeline)</h3>
        <p className="scanner-findings-view__form-hint scanner-findings-view__form-hint--top">
          Scans either a local folder (pushed to GitHub first) or a GitHub URL directly (nothing to
          push - it's already there), creates ONE Jira ticket covering everything fixable, then opens
          ONE PR that references that ticket. Project name, GitHub owner, and Repo are all worked out
          automatically - the repo name and owner come straight from a GitHub URL, or the folder name
          and the default owner (<span className="mono">{DEFAULT_GITHUB_OWNER}</span>) for a local path.
        </p>
        <div className="scanner-findings-view__form-row">
          <label>
            Project source <span className="scanner-findings-view__optional">(local path or GitHub URL)</span>
            <input
              type="text"
              value={pushForm.source}
              onChange={(e) => setPushForm((f) => ({ ...f, source: e.target.value }))}
              onBlur={handleSourceBlur}
              placeholder="D:\demo-vuln-projects\java-legacy-service  or  https://github.com/kamini1007/Dummy_project_1"
              disabled={pushState.running}
              required
            />
          </label>

          <label>
            Base branch
            {branches.list.length > 0 ? (
              <select value={pushForm.baseBranch} onChange={(e) => setPushForm((f) => ({ ...f, baseBranch: e.target.value }))} disabled={pushState.running}>
                {branches.list.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ) : (
              <input type="text" value={pushForm.baseBranch} onChange={(e) => setPushForm((f) => ({ ...f, baseBranch: e.target.value }))}
                disabled={pushState.running} placeholder={branches.loading ? 'Loading branches…' : 'main'} />
            )}
          </label>
          <label>
            New branch name <span className="scanner-findings-view__optional">(optional - defaults to the Jira key)</span>
            <input type="text" value={pushForm.newBranchName} onChange={(e) => setPushForm((f) => ({ ...f, newBranchName: e.target.value }))}
              placeholder="e.g. fix/SCRUM-123" disabled={pushState.running} />
          </label>
          <button type="submit" className="button button--primary" disabled={pushState.running}>
            {pushState.running ? 'Working…' : 'Run full pipeline'}
          </button>
        </div>

        {branches.error && (
          <p className="scanner-findings-view__form-hint">
            Couldn't load real branches ({branches.error.message}) - typing a branch name manually still works.
          </p>
        )}

        {!sourceIsGitHubUrl && (
          <label className="scanner-findings-view__force-push-label">
            <input type="checkbox" checked={pushForm.forcePush} onChange={(e) => setPushForm((f) => ({ ...f, forcePush: e.target.checked }))} disabled={pushState.running} />
            Force push (overwrites the remote repo's history to match this local copy exactly)
          </label>
        )}

        {pushState.running && (
          <div className="scanner-findings-view__scanning">
            In progress - this can take up to a couple of minutes…
          </div>
        )}
        {pushState.result && (
          <div className="scanner-findings-view__success">
            <p>{pushState.result.cvesFound} CVE(s) found, {pushState.result.fixableFindings} fixable.</p>

            {pushState.result.jiraTicket && !pushState.result.jiraTicket.dryRun && (
              <p>
                <a href={pushState.result.jiraTicket.ticketUrl} target="_blank" rel="noreferrer">
                  {pushState.result.jiraTicket.ticketKey} opened in Jira ↗
                </a>
              </p>
            )}
            {pushState.result.jiraTicket && pushState.result.jiraTicket.dryRun && pushState.result.fixableFindings > 0 && (
              <p className="scanner-findings-view__form-hint">No Jira ticket created - Jira isn't configured on ingestion-service.</p>
            )}

            {pushState.result.pr ? (
              <>
                <p>
                  <a href={pushState.result.pr.prUrl} target="_blank" rel="noreferrer">
                    PR #{pushState.result.pr.prNumber} opened ↗
                  </a>
                  {' — branch '}<span className="mono">{pushState.result.pr.branchName}</span>
                </p>
                <ul className="scanner-findings-view__batch-included">
                  {pushState.result.pr.included.map((item) => (
                    <li key={`${item.cveId}-${item.packageName}`}>{item.cveId}: {item.packageName} {item.oldVersion} → {item.newVersion} ({item.manifestPath})</li>
                  ))}
                </ul>
              </>
            ) : <p>No fixable findings, so no ticket or PR was opened.</p>}
          </div>
        )}
        {pushState.error && <div className="error-banner">{pushState.error.message}</div>}

        {postScanRun && (
          <ol className="pipeline-run-steps">
            {postScanRun.steps.map((step) => (
              <li key={step.key} className={`pipeline-run-steps__item pipeline-run-steps__item--${step.status}`}>
                <span className="pipeline-run-steps__icon" aria-hidden="true">{step.status === 'done' ? '✓' : step.status === 'running' ? '…' : '○'}</span>
                <span className="pipeline-run-steps__label">{step.label}</span>
                <span className="pipeline-run-steps__description">{step.description}</span>
              </li>
            ))}
          </ol>
        )}
        {postScanRun?.error && <div className="error-banner">{postScanRun.error}</div>}
        {postScanRun && !postScanRun.running && !postScanRun.error && (
          <p className="pipeline-run-steps__done-message">Analysis and risk scoring complete - CVE Explorer is up to date.</p>
        )}
      </form>

      <form className="card scanner-findings-view__form" onSubmit={handleScan}>
        <h3 className="scanner-findings-view__form-title">Scan a project (scan only)</h3>
        <div className="scanner-findings-view__form-row">
          <label>
            Project name
            <input type="text" value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="my-other-project" disabled={scanState.running} required />
          </label>
          <label>
            GitHub URL or local path
            <input type="text" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="https://github.com/owner/repo or D:\path\to\project" disabled={scanState.running} required />
          </label>
          <button type="submit" className="button" disabled={scanState.running}>{scanState.running ? 'Scanning…' : 'Run scan'}</button>
        </div>
        <p className="scanner-findings-view__form-hint">Scan only - no ticket, no PR. Use the full pipeline above if you want those too.</p>
        {scanState.running && <div className="scanner-findings-view__scanning">Scan in progress…</div>}
        {scanState.result && <div className="scanner-findings-view__success">Scan complete: {scanState.result.cvesUpserted} CVE(s) found, {scanState.result.skippedNonCve} non-CVE advisories skipped.</div>}
        {scanState.error && <div className="error-banner">Scan failed: {scanState.error.message}</div>}
      </form>

      {state.loading && <div className="scanner-findings-view__loading">Loading…</div>}
      {state.error && <div className="error-banner">Couldn't load scanner findings: {state.error.message}</div>}
      {!state.loading && !state.error && state.findings.length === 0 && (
        <div className="card scanner-findings-view__empty"><p>No scanner findings yet. Run a scan above to get started.</p></div>
      )}
      {!state.loading && !state.error && state.findings.length > 0 && (
        <div className="card scanner-findings-view__table-wrap">
          <table className="scanner-findings-table">
            <thead>
              <tr>
                <th>Project</th><th>CVE</th><th>Severity</th><th>Package</th><th>Installed</th><th>Fix available</th><th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {state.findings.map((f) => (
                <tr key={`${f.cveId}-${f.projectName}-${f.packageName}`}>
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

      <h2 className="scanner-findings-view__section-title">Fix PR history</h2>
      <p className="view-subtitle">Every GitHub pull request created above, bumping vulnerable dependencies to their fixed versions.</p>

      {prHistory.loading && <div className="scanner-findings-view__loading">Loading…</div>}
      {prHistory.error && <div className="error-banner">Couldn't load fix PR history: {prHistory.error.message}</div>}
      {!prHistory.loading && !prHistory.error && prHistory.prs.length === 0 && (
        <div className="card scanner-findings-view__empty"><p>No fix PRs created yet.</p></div>
      )}
      {!prHistory.loading && !prHistory.error && prHistory.prs.length > 0 && (
        <div className="card scanner-findings-view__table-wrap">
          <table className="scanner-findings-table">
            <thead><tr><th>CVE</th><th>Repo</th><th>Package</th><th>Change</th><th>Jira</th><th>PR</th><th>Created</th></tr></thead>
            <tbody>
              {prHistory.prs.map((pr) => (
                <tr key={pr.id}>
                  <td className="mono">{pr.cveId}</td>
                  <td>{pr.owner}/{pr.repo}</td>
                  <td className="mono">{pr.packageName}</td>
                  <td className="mono">{pr.oldVersion} <span className="fix-prs-table__arrow">→</span> <span className="fix-prs-table__new-version">{pr.newVersion}</span></td>
                  <td>
                    {pr.jiraTicketKey ? (
                      <a href={pr.jiraTicketUrl} target="_blank" rel="noreferrer">{pr.jiraTicketKey} ↗</a>
                    ) : (
                      <span className="mono">—</span>
                    )}
                  </td>
                  <td><a href={pr.prUrl} target="_blank" rel="noreferrer">#{pr.prNumber} ↗</a></td>
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
