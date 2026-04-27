import { describe, expect, it } from 'vitest';
import {
  isSameDay,
  startOfDay,
  fmtIsoDate,
  fmtIsoDateOptional,
  fmtIsoMonth,
  parseIsoDate,
  monthsBetween,
  relativeFromNow,
} from './dates';

describe('isSameDay', () => {
  it('returns true for the same timestamp', () => {
    const ts = new Date('2024-06-15T10:00:00').getTime();
    expect(isSameDay(ts, ts)).toBe(true);
  });

  it('returns true for two times on the same calendar day', () => {
    const a = new Date('2024-06-15T08:00:00').getTime();
    const b = new Date('2024-06-15T23:59:00').getTime();
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for different calendar days', () => {
    const a = new Date('2024-06-15T23:59:00').getTime();
    const b = new Date('2024-06-16T00:01:00').getTime();
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false across months', () => {
    const a = new Date('2024-01-31').getTime();
    const b = new Date('2024-02-01').getTime();
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('startOfDay', () => {
  it('returns midnight of the given day', () => {
    const ts = new Date('2024-06-15T14:30:00').getTime();
    const sod = startOfDay(ts);
    const d = new Date(sod);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(15);
  });
});

describe('fmtIsoDate', () => {
  it('formats a timestamp to YYYY-MM-DD', () => {
    const ts = Date.UTC(2024, 5, 15); // June 15 2024 UTC
    expect(fmtIsoDate(ts)).toBe('2024-06-15');
  });
});

describe('fmtIsoDateOptional', () => {
  it('returns empty string when undefined', () => {
    expect(fmtIsoDateOptional(undefined)).toBe('');
  });

  it('formats when a timestamp is provided', () => {
    const ts = Date.UTC(2024, 0, 1);
    expect(fmtIsoDateOptional(ts)).toBe('2024-01-01');
  });
});

describe('fmtIsoMonth', () => {
  it('formats a timestamp to YYYY-MM', () => {
    const ts = Date.UTC(2024, 5, 15);
    expect(fmtIsoMonth(ts)).toBe('2024-06');
  });
});

describe('parseIsoDate', () => {
  it('parses a valid ISO date string to a timestamp', () => {
    const result = parseIsoDate('2024-06-15');
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result!)).toBe(true);
  });

  it('returns undefined for an empty string', () => {
    expect(parseIsoDate('')).toBeUndefined();
  });

  it('returns undefined for an invalid string', () => {
    expect(parseIsoDate('not-a-date')).toBeUndefined();
  });
});

describe('monthsBetween', () => {
  it('returns 0 for timestamps in the same month', () => {
    const a = new Date(2024, 5, 1).getTime();  // June 1 local
    const b = new Date(2024, 5, 30).getTime(); // June 30 local
    expect(monthsBetween(a, b)).toBe(0);
  });

  it('returns 12 for exactly one year apart', () => {
    const a = new Date(2023, 5, 1).getTime();
    const b = new Date(2024, 5, 1).getTime();
    expect(monthsBetween(a, b)).toBe(12);
  });

  it('handles cross-year boundaries', () => {
    const a = new Date(2023, 10, 1).getTime(); // November
    const b = new Date(2024, 1, 1).getTime();  // February
    expect(monthsBetween(a, b)).toBe(3);
  });
});

describe('relativeFromNow', () => {
  const now = new Date('2024-06-15T12:00:00').getTime();

  it('returns "just now" for timestamps under a minute ago', () => {
    expect(relativeFromNow(now - 30_000, now)).toBe('just now');
    expect(relativeFromNow(now - 59_999, now)).toBe('just now');
  });

  it('returns minutes for timestamps under an hour ago', () => {
    expect(relativeFromNow(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relativeFromNow(now - 59 * 60_000, now)).toBe('59m ago');
  });

  it('returns hours for timestamps under a day ago', () => {
    expect(relativeFromNow(now - 3 * 60 * 60_000, now)).toBe('3h ago');
  });

  it('returns days for timestamps under a week ago', () => {
    expect(relativeFromNow(now - 2 * 24 * 60 * 60_000, now)).toBe('2d ago');
  });

  it('returns weeks for timestamps under 30 days ago', () => {
    expect(relativeFromNow(now - 14 * 24 * 60 * 60_000, now)).toBe('2w ago');
  });

  it('returns months for timestamps under a year ago', () => {
    expect(relativeFromNow(now - 60 * 24 * 60 * 60_000, now)).toBe('2mo ago');
  });

  it('returns years for old timestamps', () => {
    expect(relativeFromNow(now - 400 * 24 * 60 * 60_000, now)).toBe('1y ago');
  });

  it('returns "in the future" for future timestamps', () => {
    expect(relativeFromNow(now + 10_000, now)).toBe('in the future');
  });
});
