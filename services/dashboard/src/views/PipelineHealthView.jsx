import { useEffect, useState } from 'react';
import { pipelineHealthApi } from '../api/pipelineHealthApi';
import { SeverityBadge } from '../components/SeverityBadge';

export function PipelineHealthView() {
  const [state, setState] = useState({ loading: true, health: null, error: null });

  useEffect(() => {
    let cancelled = false;

    pipelineHealthApi
      .getHealth()
      .then((health) => {
        if (!cancelled) setState({ loading: false, health, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, health: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pipeline-health-view">
      <h1>Pipeline Health</h1>
      <p className="view-subtitle">
        How many CVEs are sitting at each stage of the pipeline right now - useful for spotting
        where a backlog is building up.
      </p>

      {state.loading && <div className="pipeline-health-view__loading">Loading…</div>}
      {state.error && (
        <div className="error-banner">Couldn't load pipeline health: {state.error.message}</div>
      )}

      {state.health && (
        <div className="pipeline-health-view__stages">
          <StageCard title="1. Ingestion" total={state.health.ingestion.total}>
            <StatRow label="Total CVEs" value={state.health.ingestion.total} />
          </StageCard>

          <FunnelArrow />

          <StageCard title="2. AI Analysis">
            <StatRow label="Succeeded" value={state.health.analysis.success} tone="good" />
            <StatRow label="Failed" value={state.health.analysis.failed} tone="bad" />
            <StatRow label="Not yet analyzed" value={state.health.analysis.notYetAnalyzed} tone="pending" />
          </StageCard>

          <FunnelArrow />

          <StageCard title="3. Risk Scoring">
            <StatRow label={<SeverityBadge level="CRITICAL" size="sm" />} value={state.health.riskScoring.critical} />
            <StatRow label={<SeverityBadge level="HIGH" size="sm" />} value={state.health.riskScoring.high} />
            <StatRow label={<SeverityBadge level="MEDIUM" size="sm" />} value={state.health.riskScoring.medium} />
            <StatRow label={<SeverityBadge level="LOW" size="sm" />} value={state.health.riskScoring.low} />
            <StatRow label="Not yet scored" value={state.health.riskScoring.notYetScored} tone="pending" />
          </StageCard>

          <FunnelArrow />

          <StageCard title="4. Remediation">
            <StatRow label="Actions created" value={state.health.remediation.actionsCreated} tone="good" />
            <StatRow
              label="Eligible (HIGH/CRITICAL) but not yet actioned"
              value={state.health.remediation.eligibleNotYetActioned}
              tone="pending"
            />
          </StageCard>
        </div>
      )}
    </div>
  );
}

function StageCard({ title, children }) {
  return (
    <div className="card pipeline-health-view__stage">
      <h3 className="pipeline-health-view__stage-title">{title}</h3>
      <div className="pipeline-health-view__stage-body">{children}</div>
    </div>
  );
}

function StatRow({ label, value, tone }) {
  return (
    <div className={`pipeline-health-view__stat pipeline-health-view__stat--${tone || 'neutral'}`}>
      <span className="pipeline-health-view__stat-label">{label}</span>
      <span className="mono pipeline-health-view__stat-value">{value}</span>
    </div>
  );
}

function FunnelArrow() {
  return <div className="pipeline-health-view__arrow" aria-hidden="true">↓</div>;
}
