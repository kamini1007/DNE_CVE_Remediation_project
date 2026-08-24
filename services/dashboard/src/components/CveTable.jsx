import { Fragment } from 'react';
import { SeverityBadge, SeverityBar } from './SeverityBadge';
import { CveDetailPanel } from './CveDetailPanel';
import { formatDate, formatScore } from '../utils/format';

export function CveTable({ rows, selectedCveId, onSelect }) {
  if (rows.length === 0) {
    return (
      <div className="card empty-state">
        No scored CVEs yet. Trigger the pipeline above, or check back once ingestion/analysis/scoring have run.
      </div>
    );
  }

  return (
    <div className="card cve-table__wrapper">
      <table className="cve-table">
        <thead>
          <tr>
            <th />
            <th>CVE ID</th>
            <th>Risk level</th>
            <th>Risk score</th>
            <th>Scored at</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = row.cveId === selectedCveId;
            return (
              <Fragment key={row.cveId}>
                <tr
                  className={isSelected ? 'cve-table__row--selected' : ''}
                  // Clicking the already-open row closes it, same as the
                  // panel's own Close button - accordion behavior.
                  onClick={() => onSelect(isSelected ? null : row.cveId)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(isSelected ? null : row.cveId)}
                >
                  <td className="cve-table__bar-cell">
                    <SeverityBar level={row.riskLevel} />
                  </td>
                  <td className="mono">{row.cveId}</td>
                  <td>
                    <SeverityBadge level={row.riskLevel} size="sm" />
                  </td>
                  <td className="mono">{formatScore(row.riskScore)}</td>
                  <td className="cve-table__timestamp">{formatDate(row.computedAt)}</td>
                </tr>
                {isSelected && (
                  <tr className="cve-table__detail-row">
                    <td colSpan={5} className="cve-table__detail-cell">
                      <CveDetailPanel cveId={row.cveId} onClose={() => onSelect(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
