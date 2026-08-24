const NAV_ITEMS = [
  { key: 'cves', label: 'CVE Explorer' },
  { key: 'learning', label: 'Continuous Learning' },
  { key: 'scanner-findings', label: 'Scanner Findings' },
  { key: 'pipeline-health', label: 'Pipeline Health' },
];

export function Sidebar({ activeView, onNavigate }) {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true" />
        <div>
          <div className="sidebar__brand-name">CVE Console</div>
          <div className="sidebar__brand-sub">Remediation Platform</div>
        </div>
      </div>

      <ul className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.key}>
            <button
              className={`sidebar__nav-item ${activeView === item.key ? 'sidebar__nav-item--active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={activeView === item.key ? 'page' : undefined}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
