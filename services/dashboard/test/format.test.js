import { describe, it, expect } from 'vitest';
import { formatScore, normalizeLevel, formatDate } from '../src/utils/format';

describe('formatScore', () => {
  it('formats numbers to one decimal place', () => {
    expect(formatScore(9.85)).toBe('9.9');
    expect(formatScore(0)).toBe('0.0');
    expect(formatScore('7.2')).toBe('7.2');
  });

  it('renders an em dash for null/undefined rather than "null"', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
  });
});

describe('normalizeLevel', () => {
  it('uppercases recognized levels', () => {
    expect(normalizeLevel('critical')).toBe('CRITICAL');
    expect(normalizeLevel('High')).toBe('HIGH');
  });

  it('maps unrecognized or missing levels to UNKNOWN', () => {
    expect(normalizeLevel('SEVERE')).toBe('UNKNOWN');
    expect(normalizeLevel(null)).toBe('UNKNOWN');
    expect(normalizeLevel('')).toBe('UNKNOWN');
  });
});

describe('formatDate', () => {
  it('renders an em dash for missing or invalid dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats a valid ISO string into something human-readable', () => {
    const result = formatDate('2024-03-15T10:30:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2024');
  });
});
