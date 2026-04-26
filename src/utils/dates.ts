export function fmtIsoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function fmtIsoDateOptional(ts?: number): string {
  return ts ? fmtIsoDate(ts) : '';
}

export function fmtIsoMonth(ts: number): string {
  return new Date(ts).toISOString().slice(0, 7);
}

export function parseIsoDate(s: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

export function monthsBetween(fromTs: number, toTs: number): number {
  const f = new Date(fromTs);
  const t = new Date(toTs);
  return (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
}

export function todayIso(): string {
  return fmtIsoDate(Date.now());
}

export function relativeFromNow(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 0) return 'in the future';
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}
