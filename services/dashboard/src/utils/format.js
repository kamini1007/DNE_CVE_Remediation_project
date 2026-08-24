export function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatScore(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(1);
}

/** Normalizes a level string (any case, possibly null) to the canonical uppercase form used across the severity ramp. */
export function normalizeLevel(level) {
  if (!level) return 'UNKNOWN';
  const upper = String(level).toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(upper) ? upper : 'UNKNOWN';
}
