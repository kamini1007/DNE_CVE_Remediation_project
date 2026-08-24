// RECONSTRUCTED - class names (stat-card, stat-card__label, etc.) are a
// best guess matching this project's existing BEM-style naming convention
// (page-header, filter-chip, sidebar__nav-item, etc.), not verified against
// your actual stats.css. If these don't pick up the right styling, share
// stats.css and I'll match it exactly instead of guessing.
export function StatCard({ label, value, sublabel, tone }) {
  return (
    <div className={`stat-card ${tone ? `stat-card--${tone}` : ''}`}>
      <div className="stat-card__label">{label.toUpperCase()}</div>
      <div className="stat-card__value mono">{value}</div>
      <div className="stat-card__sublabel">{sublabel}</div>
    </div>
  );
}
