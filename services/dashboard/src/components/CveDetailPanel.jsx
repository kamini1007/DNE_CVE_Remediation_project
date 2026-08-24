import { useEffect, useState } from 'react';
import { ingestionApi } from '../api/ingestionApi';
import { analysisApi } from '../api/analysisApi';
import { riskApi } from '../api/riskApi';
import { remediationApi } from '../api/remediationApi';
import { SeverityBadge } from './SeverityBadge';
import { StatusPill } from './StatusPill';
import { FeedbackWidget } from './FeedbackWidget';
import { formatDate, formatScore } from '../utils/format';

/**
 * Fetches from all backend services in parallel for one CVE. Each section
 * degrades independently: a 404 from analysis/risk/remediation means "this
 * stage hasn't reached this CVE yet", which is a normal, expected state in a
 * pipeline (not an error) - the CVE detail can still show what earlier
 * stages produced. Scanner findings are different from the other sections:
 * most CVEs come from NVD/MITRE, not a scan, so an empty result there is the
 * common case, not a "not yet available" state - the whole section is
 * hidden rather than showing a placeholder, to keep the panel clean for the
 * majority of CVEs that were never found by a scanner at all.
 */
export function CveDetailPanel({ cveId, onClose }) {
  const [state, setState] = useState({
    loading: true,
    cve: null,
    analysis: null,
    risk: null,
    remediation: null,
    scannerFindings: [],
    fatalError: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, fatalError: null }));

      const [cveResult, analysisResult, riskResult, remediationResult, scannerResult] = await Promise.allSettled([
        ingestionApi.getCve(cveId),
        analysisApi.getAnalysis(cveId),
        riskApi.getRiskScore(cveId),
        remediationApi.getRemediation(cveId),
        ingestionApi.getScannerFindings(cveId),
      ]);

      if (cancelled) return;

      // The CVE itself (from ingestion-service) not existing is the one
      // genuinely fatal case - everything else not existing yet is normal.
      if (cveResult.status === 'rejected') {
        setState((s) => ({ ...s, loading: false, fatalError: cveResult.reason }));
        return;
      }

      setState({
        loading: false,
        fatalError: null,
        cve: cveResult.value,
        analysis: unwrapOrNull(analysisResult),
        risk: unwrapOrNull(riskResult),
        remediation: unwrapOrNull(remediationResult),
        scannerFindings: scannerResult.status === 'fulfilled' ? scannerResult.value || [] : [],
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cveId]);

  return (
    <div className="detail-panel card">
      <div className="detail-panel__header">
        <h2 className="mono detail-panel__id">{cveId}</h2>
        <button className="button detail-panel__close" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      {state.loading && <div className="detail-panel__loading">Loading…</div>}

      {state.fatalError && (
        <div className="error-banner">Couldn't load {cveId} from ingestion-service: {state.fatalError.message}</div>
      )}

      {!state.loading && !state.fatalError && (
        <div className="detail-panel__body">
          <DetailSection title="Overview">
            <dl className="detail-grid">
              <DetailRow label="Vendor / Product" value={[state.cve.vendor, state.cve.product].filter(Boolean).join(' / ') || '—'} />
              <DetailRow label="CVSS v3" value={formatScore(state.cve.cvssV3Score)} />
              <DetailRow label="Published" value={formatDate(state.cve.publishedDate)} />
              <DetailRow label="Last modified" value={formatDate(state.cve.lastModifiedDate)} />
              <DetailRow label="Sources" value={state.cve.contributingSources || state.cve.primarySource || '—'} />
            </dl>
          </DetailSection>

          {state.scannerFindings.length > 0 && (
            <DetailSection title="Scanner findings">
              <ul className="scanner-findings-list">
                {state.scannerFindings.map((finding) => (
                  <li key={`${finding.projectName}-${finding.packageName}`} className="scanner-findings-list__item">
                    <div className="scanner-findings-list__project">{finding.projectName}</div>
                    <div className="scanner-findings-list__detail">
                      <span className="mono">{finding.packageName}</span>
                      {' '}
                      <span className="scanner-findings-list__version">{finding.installedVersion || '—'}</span>
                      {finding.fixedVersion && (
                        <>
                          {' → fix available: '}
                          <span className="scanner-findings-list__version scanner-findings-list__version--fixed">
                            {finding.fixedVersion}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="scanner-findings-list__meta">
                      {finding.scannerSource} · {finding.target || 'unknown target'} · scanned {formatDate(finding.scannedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          <DetailSection title="AI analysis">
            {state.analysis ? (
              <>
                <p className="detail-panel__text">{state.analysis.simplifiedDescription}</p>
                <dl className="detail-grid">
                  <DetailRow label="Exploitability" value={<SeverityBadge level={state.analysis.exploitabilityLevel} size="sm" />} />
                  <DetailRow label="Rationale" value={state.analysis.exploitabilityRationale || '—'} />
                  <DetailRow label="Potential impact" value={state.analysis.potentialImpact || '—'} />
                </dl>
                <FeedbackWidget cveId={cveId} feedbackType="ANALYSIS_ACCURACY" label="Was this analysis accurate?" />
              </>
            ) : (
              <NotYetAvailable label="Not yet analyzed by ai-analysis-service." />
            )}
          </DetailSection>

          <DetailSection title="Risk score">
            {state.risk ? (
              <>
                <div className="detail-panel__risk-headline">
                  <SeverityBadge level={state.risk.riskLevel} />
                  <span className="mono detail-panel__risk-score">{formatScore(state.risk.riskScore)} / 100</span>
                </div>
                <dl className="detail-grid">
                  <DetailRow label="CVSS component" value={formatScore(state.risk.cvssComponent)} />
                  <DetailRow label="Exploitability component" value={formatScore(state.risk.exploitabilityComponent)} />
                  <DetailRow label="Asset criticality component" value={formatScore(state.risk.assetCriticalityComponent)} />
                  <DetailRow label="Network exposure component" value={formatScore(state.risk.networkExposureComponent)} />
                  <DetailRow label="Business impact component" value={formatScore(state.risk.businessImpactComponent)} />
                  <DetailRow label="Scoring model" value={state.risk.scoringModelVersion || '—'} />
                </dl>
                <FeedbackWidget cveId={cveId} feedbackType="RISK_ACCURACY" label="Was this risk score accurate?" />
              </>
            ) : (
              <NotYetAvailable label="Not yet scored by risk-engine-service." />
            )}
          </DetailSection>

          <DetailSection title="Remediation">
            {state.remediation ? (
              <>
                <div className="detail-panel__risk-headline">
                  <StatusPill status={state.remediation.status} />
                  {state.remediation.jiraTicketUrl && (
                    <a href={state.remediation.jiraTicketUrl} target="_blank" rel="noreferrer">
                      {state.remediation.jiraTicketKey} ↗
                    </a>
                  )}
                </div>
                <PlaybookSteps playbook={state.remediation.playbook} />
              </>
            ) : (
              <NotYetAvailable label="No remediation action yet - CVE may be below the remediation risk threshold, or not yet processed." />
            )}
          </DetailSection>
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <h3 className="detail-section__title">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function NotYetAvailable({ label }) {
  return <p className="detail-panel__not-available">{label}</p>;
}

function PlaybookSteps({ playbook }) {
  if (!playbook || !Array.isArray(playbook.steps) || playbook.steps.length === 0) {
    return null;
  }
  return (
    <ol className="playbook-steps">
      {playbook.steps.map((step) => (
        <li key={step.order}>
          <span className="playbook-steps__priority mono">{step.priority}</span>
          <span>{step.action}</span>
          <span className="playbook-steps__owner">{step.owner}</span>
        </li>
      ))}
    </ol>
  );
}

/** Promise.allSettled result -> value, or null on rejection (treated as "not available yet", not an error, for 404s). */
function unwrapOrNull(settledResult) {
  if (settledResult.status !== 'fulfilled') {
    return null;
  }
  return settledResult.value;
}
