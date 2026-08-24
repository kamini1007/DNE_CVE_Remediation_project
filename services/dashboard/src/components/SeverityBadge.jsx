import { normalizeLevel } from '../utils/format';

const LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
  UNKNOWN: 'Unknown',
};

/**
 * The severity ramp is the dashboard's signature element: every place a
 * risk/exploitability/severity level appears, it's rendered with this same
 * component and color mapping, so the eye learns the ramp once and can read
 * it everywhere - table rows, detail panels, remediation urgency, etc.
 */
export function SeverityBadge({ level, size = 'md' }) {
  const normalized = normalizeLevel(level);
  const varName = `--severity-${normalized.toLowerCase()}`;
  const softVarName = `${varName}-soft`;

  return (
    <span
      className={`severity-badge severity-badge--${size}`}
      style={{
        color: `var(${varName})`,
        background: `var(${softVarName})`,
        borderColor: `var(${varName})`,
      }}
    >
      <span className="severity-badge__dot" style={{ background: `var(${varName})` }} />
      {LABELS[normalized]}
    </span>
  );
}

/** The persistent left-edge signal bar used on every CVE row/card - the throughline of the visual system. */
export function SeverityBar({ level }) {
  const normalized = normalizeLevel(level);
  return <span className="severity-bar" style={{ background: `var(--severity-${normalized.toLowerCase()})` }} />;
}
