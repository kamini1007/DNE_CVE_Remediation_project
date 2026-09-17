import { useEffect, useState } from 'react';
import { riskApi } from '../api/riskApi';
import { ingestionApi } from '../api/ingestionApi';
import { analysisApi } from '../api/analysisApi';
import { remediationApi } from '../api/remediationApi';
import { pipelineHealthApi } from '../api/pipelineHealthApi';
import { StatCard } from '../components/StatCard';
import { CveTable } from '../components/CveTable';

const LEVEL_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const PAGE_SIZE = 25;

const STAGE_INFO = {
  ingestion: { label: 'Ingestion', description: 'Pulling new or updated CVEs from NVD, MITRE, and configured vendor advisory feeds into the shared database.' },
  analysis: { label: 'AI analysis', description: 'Sending each newly-ingested CVE to the AI model to generate a plain-language exploitability and impact assessment.' },
  riskScoring: { label: 'Risk scoring', description: 'Calculating a weighted 0-100 risk score per CVE from CVSS, exploitability, and your configured asset-criticality/exposure/business-impact profile.' },
  remediation: { label: 'Remediation', description: 'Generating a prioritized remediation playbook (and opening a Jira ticket if configured) for every CVE scored HIGH or CRITICAL.' },
};

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

export function CveExplorerView() {
  const [level, setLevel] = useState('ALL');
  const [page, setPage] = useState(0);
  const [selectedCveId, setSelectedCveId] = useState(null);
  const [triggerStatus, setTriggerStatus] = useState(null);
  const [pipelineRun, setPipelineRun] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const criticalQuery = useApiOnce(() => riskApi.listPrioritized({ level: 'CRITICAL', size: 1 }), [refreshKey]);
  const highQuery = useApiOnce(() => riskApi.listPrioritized({ level: 'HIGH', size: 1 }), [refreshKey]);
  const mediumQuery = useApiOnce(() => riskApi.listPrioritized({ level: 'MEDIUM', size: 1 }), [refreshKey]);

  // sort=computedAt,desc - most-recently-scored CVEs first, instead of the
  // previous highest-risk-first ordering. RECONSTRUCTED ASSUMPTION: this
  // relies on the backend's /api/risk endpoint already supporting standard
  // Spring Data Pageable sort binding (very common, since it already
  // accepts page/size the same way) - not verified against the actual
  // controller/repository code. If ordering doesn't actually change after
  // applying this, that confirms the backend needs an explicit code
  // change instead, and I'll need the real file to do that correctly.
  const cveQuery = useApiOnce(
    () => riskApi.listPrioritized({ ...(level === 'ALL' ? {} : { level }), page, size: PAGE_SIZE, sort: 'computedAt,desc' }),
    [level, page, refreshKey]
  );
  const cveRows = (cveQuery.data?.content || []).map((r) => ({
    cveId: r.cveId,
    riskLevel: r.riskLevel,
    riskScore: r.riskScore,
    computedAt: r.computedAt,
  }));
  const totalPages = cveQuery.data?.totalPages ?? 0;

  function changeLevel(next) {
    setLevel(next);
    setPage(0);
  }

  function refreshEverything() {
    setRefreshKey((k) => k + 1);
  }

  async function handleTrigger(stageKey, fn) {
    const info = STAGE_INFO[stageKey];
    setTriggerStatus(`${info.label}: ${info.description}`);
    try {
      await fn();
      setTriggerStatus(`${info.label} triggered successfully. Give it a few seconds, then refresh to see updated numbers.`);
    } catch (err) {
      setTriggerStatus(`${info.label} failed to trigger: ${err.message}`);
    }
  }

  async function runFullPipeline() {
    const steps = Object.keys(STAGE_INFO).map((key) => ({
      key, label: STAGE_INFO[key].label, description: STAGE_INFO[key].description, status: 'pending',
    }));
    setPipelineRun({ steps, error: null, running: true });

    function updateStep(key, patch) {
      setPipelineRun((s) => (s ? { ...s, steps: s.steps.map((st) => (st.key === key ? { ...st, ...patch } : st)) } : s));
    }

    try {
      updateStep('ingestion', { status: 'running' });
      await Promise.all(['NVD', 'MITRE', 'VENDOR'].map((source) => ingestionApi.triggerIngestion(source)));
      await pollUntilStable((h) => h.ingestion.total);
      updateStep('ingestion', { status: 'done' });

      updateStep('analysis', { status: 'running' });
      await analysisApi.triggerBatch();
      await pollUntilStable((h) => h.analysis.notYetAnalyzed);
      updateStep('analysis', { status: 'done' });

      updateStep('riskScoring', { status: 'running' });
      await riskApi.triggerBatch();
      await pollUntilStable((h) => h.riskScoring.notYetScored);
      updateStep('riskScoring', { status: 'done' });

      updateStep('remediation', { status: 'running' });
      await remediationApi.triggerBatch();
      await pollUntilStable((h) => h.remediation.eligibleNotYetActioned);
      updateStep('remediation', { status: 'done' });
    } catch (err) {
      setPipelineRun((s) => (s ? { ...s, error: err.message } : s));
    } finally {
      setPipelineRun((s) => (s ? { ...s, running: false } : s));
      refreshEverything();
    }
  }

  return (
    <div className="scanner-findings-view">
      <h1>CVE Explorer</h1>
      <p className="view-subtitle">Every risk-scored CVE, most recently scored first. Select one to see its full pipeline record.</p>

      <div className="stats-grid">
        <StatCard label="Critical" value={criticalQuery.data?.totalElements ?? '—'} sublabel="Risk-scored CVEs" tone="critical" />
        <StatCard label="High" value={highQuery.data?.totalElements ?? '—'} sublabel="Risk-scored CVEs" tone="high" />
        <StatCard label="Medium" value={mediumQuery.data?.totalElements ?? '—'} sublabel="Risk-scored CVEs" />
      </div>

      <div className="card pipeline-controls">
        <div className="pipeline-controls__header">
          <h3>Pipeline controls</h3>
          <p className="pipeline-controls__subtitle">Runs each stage's scheduled job on demand</p>
        </div>
        <div className="pipeline-controls__buttons">
          <button className="button" onClick={() => handleTrigger('ingestion', () => Promise.all(['NVD', 'MITRE', 'VENDOR'].map((s) => ingestionApi.triggerIngestion(s))))}>
            Trigger ingestion
          </button>
          <button className="button" onClick={() => handleTrigger('analysis', () => analysisApi.triggerBatch())}>
            Trigger analysis
          </button>
          <button className="button" onClick={() => handleTrigger('riskScoring', () => riskApi.triggerBatch())}>
            Trigger risk scoring
          </button>
          <button className="button" onClick={() => handleTrigger('remediation', () => remediationApi.triggerBatch())}>
            Trigger remediation
          </button>
          <button className="button button--primary" onClick={runFullPipeline} disabled={pipelineRun?.running}>
            {pipelineRun?.running ? 'Running full pipeline…' : 'Run full pipeline'}
          </button>
        </div>
        {triggerStatus && <p className="pipeline-controls__status">{triggerStatus}</p>}

        {pipelineRun && (
          <ol className="pipeline-run-steps">
            {pipelineRun.steps.map((step) => (
              <li key={step.key} className={`pipeline-run-steps__item pipeline-run-steps__item--${step.status}`}>
                <span className="pipeline-run-steps__icon" aria-hidden="true">
                  {step.status === 'done' ? '✓' : step.status === 'running' ? '…' : '○'}
                </span>
                <span className="pipeline-run-steps__label">{step.label}</span>
                <span className="pipeline-run-steps__description">{step.description}</span>
              </li>
            ))}
          </ol>
        )}
        {pipelineRun?.error && <div className="error-banner">{pipelineRun.error}</div>}
        {pipelineRun && !pipelineRun.running && !pipelineRun.error && (
          <p className="pipeline-run-steps__done-message">Full pipeline run complete - numbers above are refreshed automatically.</p>
        )}
      </div>

      {cveQuery.error && <div className="error-banner">Couldn't load CVEs: {cveQuery.error.message}</div>}

      <div className="filter-bar">
        {LEVEL_FILTERS.map((option) => (
          <button
            key={option}
            className={`filter-chip ${level === option ? 'filter-chip--active' : ''}`}
            onClick={() => changeLevel(option)}
            aria-pressed={level === option}
          >
            {option === 'ALL' ? 'All levels' : option.charAt(0) + option.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {cveQuery.loading ? (
        <div className="card empty-state">Loading…</div>
      ) : (
        <CveTable rows={cveRows} selectedCveId={selectedCveId} onSelect={setSelectedCveId} />
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
          <span className="pagination__status mono">Page {page + 1} of {totalPages}</span>
          <button className="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</button>
        </div>
      )}
    </div>
  );
}
