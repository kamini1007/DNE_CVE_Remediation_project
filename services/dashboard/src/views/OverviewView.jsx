import { useApi } from '../hooks/useApi';
import { riskApi } from '../api/riskApi';
import { remediationApi } from '../api/remediationApi';
import { StatCard } from '../components/StatCard';
import { PipelineControls } from '../components/PipelineControls';
import { CveTable } from '../components/CveTable';

/**
 * Overview answers one question first: what needs attention right now.
 * So the top CRITICAL/HIGH counts and the highest-risk CVE list lead, rather
 * than total-ingested vanity metrics.
 */
export function OverviewView({ onSelectCve, selectedCveId }) {
  const criticalQuery = useApi(() => riskApi.listPrioritized({ level: 'CRITICAL', size: 1 }), []);
  const highQuery = useApi(() => riskApi.listPrioritized({ level: 'HIGH', size: 1 }), []);
  const topRiskQuery = useApi(() => riskApi.listPrioritized({ size: 10 }), []);
  const remediationQuery = useApi(() => remediationApi.listRemediations({ size: 100 }), []);

  const anyError = criticalQuery.error || highQuery.error || topRiskQuery.error || remediationQuery.error;

  const remediations = remediationQuery.data || [];
  const ticketsCreated = remediations.filter((r) => r.status === 'TICKET_CREATED').length;
  const playbooksReady = remediations.filter((r) => r.status === 'PLAYBOOK_GENERATED').length;

  const topRiskRows = (topRiskQuery.data?.content || []).map(toRow);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Prioritized vulnerability posture across ingestion, analysis, scoring, and remediation.</p>
      </header>

      {anyError && (
        <div className="error-banner">
          Some services didn't respond. Check that all four backend services are running — {anyError.message}
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label="Critical"
          value={criticalQuery.data?.totalElements ?? '—'}
          accent="var(--severity-critical)"
          sublabel="Risk-scored CVEs"
        />
        <StatCard
          label="High"
          value={highQuery.data?.totalElements ?? '—'}
          accent="var(--severity-high)"
          sublabel="Risk-scored CVEs"
        />
        <StatCard label="Tickets created" value={ticketsCreated} sublabel="In Jira" />
        <StatCard label="Playbooks ready" value={playbooksReady} sublabel="Awaiting Jira config" />
      </div>

      <PipelineControls />

      <section>
        <h2 className="section-title">Highest risk</h2>
        {topRiskQuery.loading ? (
          <div className="card empty-state">Loading…</div>
        ) : (
          <CveTable rows={topRiskRows} selectedCveId={selectedCveId} onSelect={onSelectCve} />
        )}
      </section>
    </>
  );
}

/** Spring Data Page<RiskScore> rows -> the shape CveTable expects. */
function toRow(riskScore) {
  return {
    cveId: riskScore.cveId,
    riskLevel: riskScore.riskLevel,
    riskScore: riskScore.riskScore,
    computedAt: riskScore.computedAt,
  };
}
