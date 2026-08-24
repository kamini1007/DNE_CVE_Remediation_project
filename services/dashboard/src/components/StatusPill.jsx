const STATUS_MAP = {
  SUCCESS: { color: 'var(--status-success)', label: 'Success' },
  TICKET_CREATED: { color: 'var(--status-success)', label: 'Ticket created' },
  PLAYBOOK_GENERATED: { color: 'var(--status-pending)', label: 'Playbook ready' },
  PENDING: { color: 'var(--status-pending)', label: 'Pending' },
  RUNNING: { color: 'var(--status-pending)', label: 'Running' },
  FAILED: { color: 'var(--status-failed)', label: 'Failed' },
};

export function StatusPill({ status }) {
  const entry = STATUS_MAP[status] || { color: 'var(--text-tertiary)', label: status || 'Unknown' };
  return (
    <span className="status-pill" style={{ color: entry.color }}>
      <span className="status-pill__dot" style={{ background: entry.color }} />
      {entry.label}
    </span>
  );
}
