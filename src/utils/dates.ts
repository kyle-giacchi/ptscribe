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
