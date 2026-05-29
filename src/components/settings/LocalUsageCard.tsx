import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import type { Note, Session } from '@/types';

interface UsageBucket {
  key: string;
  label: string;
  sessions: number;
  notes: number;
}

function bucketUsageByMonth(sessions: Session[], notes: Note[]): UsageBucket[] {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: fmt(d), label: d.toLocaleString(undefined, { month: 'short' }) });
  }
  const sessionByMonth = new Map<string, number>();
  for (const s of sessions) {
    const k = fmt(new Date(s.date));
    sessionByMonth.set(k, (sessionByMonth.get(k) ?? 0) + 1);
  }
  const noteByMonth = new Map<string, number>();
  for (const n of notes) {
    const k = fmt(new Date(n.createdAt));
    noteByMonth.set(k, (noteByMonth.get(k) ?? 0) + 1);
  }
  return months.map((m) => ({
    key: m.key,
    label: m.label,
    sessions: sessionByMonth.get(m.key) ?? 0,
    notes: noteByMonth.get(m.key) ?? 0,
  }));
}

export function LocalUsageCard() {
  const { sessions } = useSessions();
  const { notes } = useNotes();

  const totalMinutes = sessions.reduce((acc, s) => acc + (s.durationMin ?? 0), 0);
  const totalNotesFinalized = notes.filter((n) => n.finalized).length;
  const monthlyBuckets = bucketUsageByMonth(sessions, notes);
  const usageMax = Math.max(1, ...monthlyBuckets.flatMap((b) => [b.sessions, b.notes]));

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Local usage</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Counts derived from local data; nothing leaves this device.
        </p>
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}
        >
          <UsageStat label="Sessions" value={String(sessions.length)} />
          <UsageStat label="Minutes recorded" value={String(Math.round(totalMinutes))} />
          <UsageStat label="Notes finalized" value={String(totalNotesFinalized)} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-pt-text-3)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Last 6 months
          </div>
          <UsageBarChart data={monthlyBuckets} max={usageMax} />
          <div
            style={{
              display: 'flex',
              gap: 14,
              fontSize: 11,
              color: 'var(--color-pt-text-3)',
            }}
          >
            <LegendSwatch color="var(--color-pt-accent, #6366f1)" label="Sessions" />
            <LegendSwatch color="var(--color-pt-text-2, #94a3b8)" label="Notes" />
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-pt-border, rgba(0,0,0,0.08))',
        background: 'var(--color-pt-surface-2, rgba(0,0,0,0.02))',
        display: 'grid',
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: 'var(--color-pt-text-3)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-pt-text-1)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

// Inline SVG grouped-bar chart. recharts isn't in package.json (verified) and
// pulling visx in for a 6-bucket compact chart is overkill, so this is the
// documented fallback path the task allows. Brand accent colors fall back to
// hex when the CSS variable hasn't been resolved.
function UsageBarChart({ data, max }: { data: UsageBucket[]; max: number }) {
  const height = 180;
  const padTop = 8;
  const padBottom = 22;
  const innerH = height - padTop - padBottom;
  const groupCount = data.length;
  const sessionFill = 'var(--color-pt-accent, #6366f1)';
  const noteFill = 'var(--color-pt-text-2, #94a3b8)';

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${groupCount * 60} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Sessions and notes per month over the last 6 months"
    >
      {data.map((b, i) => {
        const groupX = i * 60;
        const barW = 22;
        const sessionsH = (b.sessions / max) * innerH;
        const notesH = (b.notes / max) * innerH;
        return (
          <g key={b.key}>
            <rect
              x={groupX + 6}
              y={padTop + (innerH - sessionsH)}
              width={barW}
              height={sessionsH}
              fill={sessionFill}
              rx={2}
            />
            <rect
              x={groupX + 32}
              y={padTop + (innerH - notesH)}
              width={barW}
              height={notesH}
              fill={noteFill}
              rx={2}
            />
            <text
              x={groupX + 30}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-pt-text-3)"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
