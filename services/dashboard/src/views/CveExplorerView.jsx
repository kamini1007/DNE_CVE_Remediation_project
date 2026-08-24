import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { riskApi } from '../api/riskApi';
import { remediationApi } from '../api/remediationApi';
import { ingestionApi } from '../api/ingestionApi';
import { analysisApi } from '../api/analysisApi';
import { pipelineHealthApi } from '../api/pipelineHealthApi';
import { CveTable } from '../components/CveTable';
import { StatCard } from '../components/StatCard';

const LEVEL_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const PAGE_SIZE = 25;

// Human-readable descriptions, shared between the individual trigger
// buttons' status messages and the "Run full pipeline" step list below -
// one place to keep this wording, not duplicated.
const STAGE_INFO = {
  ingestion: {
    label: 'Ingestion',
    description: 'Pulling new or updated CVEs from NVD, MITRE, and configured vendor advisory feeds into the shared database.',
  },
  analysis: {
    label: 'AI analysis',
    description: 'Sending each newly-ingested CVE to the AI model to generate a plain-language exploitability and impact assessment.',
  },
  riskScoring: {
    label: 'Risk scoring',
    description: 'Calculating a weighted 0-100 risk score per CVE from CVSS, exploitability, and your configured asset-criticality/exposure/business-impact profile.',
  },
  remediation: {
    label: 'Remediation',
    description: 'Generating a prioritized remediation playbook (and opening a Jira ticket if configured) for every CVE scored HIGH or CRITICAL.',
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls Pipeline Health every 2s and considers a stage "done" once the
 * given number stops changing across 2 consecutive polls - there's no
 * job-completion signal from the backend triggers (they fire-and-forget),
 * so this is an approximation, not a guarantee, capped at maxAttempts so
 * it can't hang forever if something never settles.
 */
async function pollUntilStable(selector, { maxAttempts = 20, intervalMs = 2000 } = {}) {
  let previous = null;
  let stableCount = 0;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    let health;
    try {
      health = await pipelineHealthApi.getHealth();
    } catch {
      continue; // transient error mid-poll - just keep trying
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
  return previous; // timed out - proceed anyway rather than block indefinitely
}

// Formerly the Overview page's four stat cards + Pipeline controls, merged
// in here since CVE Explorer's own table - already sorted highest-risk-
// first - made Overview's separate "Highest Risk" preview table redundant.
export function CveExplorerView({ onSelectCve, selectedCveId }) {
  const [level, setLevel] = useState('ALL');
  const [page, setPage] = useState(0);
  const [triggerStatus, setTriggerStatus] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pipelineRun, setPipelineRun] = useState(null); // null | { steps: [...], error }

  const query = useApi(
    () => riskApi.listPrioritized({ ...(level === 'ALL' ? {} : { level }), page, size: PAGE_SIZE }),
    [level, page, refreshKey]
  );

  // RECONSTRUCTED - not verified against your actual OverviewView.jsx (see
  // this project's earlier merge-pages.zip README for the full caveat).
  const criticalQuery = useApi(() => riskApi.listPrioritized({ level: 'CRITICAL', size: 1 }), [refreshKey]);
  const highQuery = useApi(() => riskApi.listPrioritized({ level: 'HIGH', size: 1 }), [refreshKey]);
  const ticketsQuery = useApi(() => remediationApi.listRemediations({ status: 'TICKET_CREATED', size: 1 }), [refreshKey]);
  const playbooksQuery = useApi(() => remediationApi.listRemediations({ size: 1 }), [refreshKey]);

  const rows = (query.data?.content || []).map((r) => ({
    cveId: r.cveId,
    riskLevel: r.riskLevel,
    riskScore: r.riskScore,
    computedAt: r.computedAt,
  }));

  const totalPages = query.data?.totalPages ?? 0;

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
      key,
      label: STAGE_INFO[key].label,
      description: STAGE_INFO[key].description,
      status: 'pending',
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
    <>
      <header className="page-header">
        <h1 className="page-title">CVE Explorer</h1>
        <p className="page-subtitle">
          Prioritized vulnerability posture across ingestion, analysis, scoring, and remediation.
        </p>
      </header>

      <div className="stats-grid">
        <StatCard label="Critical" value={criticalQuery.data?.totalElements ?? '—'} sublabel="Risk-scored CVEs" tone="critical" />
        <StatCard label="High" value={highQuery.data?.totalElements ?? '—'} sublabel="Risk-scored CVEs" tone="high" />
        <StatCard label="Tickets created" value={ticketsQuery.data?.totalElements ?? '—'} sublabel="In Jira" />
        <StatCard label="Playbooks ready" value={playbooksQuery.data?.totalElements ?? '—'} sublabel="Awaiting Jira config" />
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
          <button
            className="button button--primary"
            onClick={runFullPipeline}
            disabled={pipelineRun?.running}
          >
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
          <p className="pipeline-run-steps__done-message">
            Full pipeline run complete - numbers above are refreshed automatically.
          </p>
        )}
      </div>

      {query.error && <div className="error-banner">Couldn't load CVEs: {query.error.message}</div>}

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

      {query.loading ? (
        <div className="card empty-state">Loading…</div>
      ) : (
        <CveTable rows={rows} selectedCveId={selectedCveId} onSelect={onSelectCve} />
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </button>
          <span className="pagination__status mono">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
