import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { learningApi } from '../api/learningApi';
import { SeverityBadge } from '../components/SeverityBadge';
import { formatDate } from '../utils/format';

/**
 * Shows the latest calibration report as-is: stats and recommendations,
 * with no "apply" button anywhere. That's deliberate - every recommendation
 * here requires a human to go change risk-engine.weights or the AI prompt
 * themselves; this view is read-only by design, matching learning-service's
 * own "never auto-applies anything" guarantee.
 */
export function LearningView() {
  const [triggering, setTriggering] = useState(false);
  const query = useApi(() => learningApi.getLatestReport(), []);

  async function handleTrigger() {
    setTriggering(true);
    try {
      await learningApi.triggerReport();
      // Report generation runs async server-side; give it a moment before refetching.
      setTimeout(query.refetch, 2000);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Continuous Learning</h1>
        <p className="page-subtitle">
          Analyst feedback and remediation outcomes, aggregated into recommendations for review - nothing here is applied automatically.
        </p>
      </header>

      <div className="card pipeline-controls">
        <div className="pipeline-controls__header">
          <span className="pipeline-controls__title">Calibration report</span>
          <span className="pipeline-controls__hint">
            {query.data ? `Generated ${formatDate(query.data.generatedAt)}` : 'No report generated yet'}
          </span>
        </div>
        <div className="pipeline-controls__buttons">
          <button className="button" onClick={handleTrigger} disabled={triggering}>
            {triggering ? 'Triggering…' : 'Regenerate now'}
          </button>
        </div>
      </div>

      {query.error && query.error.status !== 404 && (
        <div className="error-banner">Couldn't load the calibration report: {query.error.message}</div>
      )}

      {query.loading && <div className="card empty-state">Loading…</div>}

      {!query.loading && !query.data && (
        <div className="card empty-state">
          No calibration report yet. Reports need at least some feedback and remediation outcome data to say anything - submit
          feedback from a CVE's detail panel, then trigger a report.
        </div>
      )}

      {query.data && (
        <>
          <RecommendationsSection recommendations={query.data.recommendations} />
          <RiskLevelStatsSection stats={query.data.riskLevelStats} />
          <PromptVersionStatsSection stats={query.data.promptVersionStats} />
        </>
      )}
    </>
  );
}

function RecommendationsSection({ recommendations }) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <h2 className="section-title">Recommendations</h2>
      {recommendations.length === 0 ? (
        <div className="card empty-state">No thresholds crossed - nothing flagged for review.</div>
      ) : (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <ul className="recommendation-list">
            {recommendations.map((rec, i) => (
              <li key={i} className={`recommendation-list__item recommendation-list__item--${rec.severity}`}>
                {rec.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RiskLevelStatsSection({ stats }) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <h2 className="section-title">Risk level calibration</h2>
      <div className="card cve-table__wrapper">
        <table className="cve-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Feedback</th>
              <th>Avg rating</th>
              <th>Resolved tickets</th>
              <th>SLA met</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.level}>
                <td>
                  <SeverityBadge level={stat.level} size="sm" />
                </td>
                <td className="mono">{stat.feedbackCount}</td>
                <td className="mono">{stat.avgRating !== null ? `${stat.avgRating} / 5` : '—'}</td>
                <td className="mono">{stat.resolvedCount}</td>
                <td className="mono">{stat.slaMetRate !== null ? `${Math.round(stat.slaMetRate * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PromptVersionStatsSection({ stats }) {
  if (stats.length === 0) return null;
  return (
    <section>
      <h2 className="section-title">AI prompt version calibration</h2>
      <div className="card cve-table__wrapper">
        <table className="cve-table">
          <thead>
            <tr>
              <th>Prompt version</th>
              <th>Feedback</th>
              <th>Avg rating</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.promptVersion}>
                <td className="mono">{stat.promptVersion}</td>
                <td className="mono">{stat.feedbackCount}</td>
                <td className="mono">{stat.avgRating} / 5</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
