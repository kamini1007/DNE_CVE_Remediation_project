import { useEffect, useState } from 'react';
import { fixPrApi } from '../api/fixPrApi';
import { formatDate } from '../utils/format';

/**
 * Permanent history of every GitHub PR this platform has actually created,
 * unlike the transient result shown right after clicking "Create fix PR" on
 * Scanner Findings (which disappears once you navigate away or collapse
 * that row). Read-only - PRs are created from Scanner Findings, this page
 * only displays what's already happened.
 */
export function FixPrsView() {
  const [state, setState] = useState({ loading: true, prs: [], error: null });

  useEffect(() => {
    fixPrApi
      .listAll()
      .then((prs) => setState({ loading: false, prs: prs || [], error: null }))
      .catch((error) => setState({ loading: false, prs: [], error }));
  }, []);

  return (
    <div className="fix-prs-view">
      <h1>Fix PRs</h1>
      <p className="view-subtitle">
        Every GitHub pull request this platform has created, bumping a vulnerable dependency to
        its fixed version. Created from the "Create fix PR" button on Scanner Findings.
      </p>

      {state.loading && <div className="fix-prs-view__loading">Loading…</div>}

      {state.error && (
        <div className="error-banner">Couldn't load fix PRs: {state.error.message}</div>
      )}

      {!state.loading && !state.error && state.prs.length === 0 && (
        <div className="card fix-prs-view__empty">
          <p>No fix PRs created yet.</p>
          <p className="fix-prs-view__hint">
            Go to Scanner Findings, find a CVE with a fix version available, and click
            "Create fix PR."
          </p>
        </div>
      )}

      {!state.loading && !state.error && state.prs.length > 0 && (
        <div className="card fix-prs-view__table-wrap">
          <table className="fix-prs-table">
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
              {state.prs.map((pr) => (
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
