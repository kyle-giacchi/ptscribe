import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Eyebrow, StatusBadge, SurfaceCard, type StatusTone } from '@/components/design';
import { fmtIsoDateOptional, relativeFromNow } from '@/utils/dates';
import { labelForType } from '@/utils/labels';
import type { Note, Session } from '@/types';

type Filter = 'all' | 'unsigned';

/**
 * Full visit history — the clinical chart view. Every visit the patient has had,
 * newest first, each expandable to the signed note without leaving the record.
 *
 * Overview shows only the last five; this is the "and everything before that"
 * surface, plus the unsigned filter a clinician uses to clear their documentation
 * backlog for one patient.
 */
export function PatientVisits({ sessions, notes }: { sessions: Session[]; notes: Note[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const noteBySession = useMemo(() => {
    const map = new Map<string, Note>();
    for (const n of notes) map.set(n.sessionId, n);
    return map;
  }, [notes]);

  const ordered = useMemo(() => [...sessions].sort((a, b) => b.date - a.date), [sessions]);
  const unsignedCount = ordered.filter((s) => !noteBySession.get(s.id)?.finalized).length;
  const visible =
    filter === 'unsigned' ? ordered.filter((s) => !noteBySession.get(s.id)?.finalized) : ordered;

  if (ordered.length === 0) {
    return (
      <SurfaceCard padding={40} style={{ textAlign: 'center' }}>
        <div
          style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-pt-text-2)' }}
        >
          No visits yet
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)', marginTop: 4 }}>
          Start a session from the header to create the first visit.
        </div>
      </SurfaceCard>
    );
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <Eyebrow>
          {ordered.length} {ordered.length === 1 ? 'visit' : 'visits'}
        </Eyebrow>
        <div style={{ display: 'flex', gap: 6 }}>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
          <FilterChip
            active={filter === 'unsigned'}
            onClick={() => setFilter('unsigned')}
            label={`Unsigned${unsignedCount ? ` (${unsignedCount})` : ''}`}
          />
        </div>
      </div>

      <SurfaceCard padding={0}>
        {visible.length === 0 ? (
          <div
            style={{
              padding: 28,
              fontSize: 'var(--text-base)',
              color: 'var(--color-pt-text-3)',
              textAlign: 'center',
            }}
          >
            Every visit is signed. Nothing pending.
          </div>
        ) : (
          visible.map((session, i) => (
            <VisitEntry
              key={session.id}
              session={session}
              note={noteBySession.get(session.id)}
              isLast={i === visible.length - 1}
              open={expanded === session.id}
              onToggle={() => setExpanded(expanded === session.id ? null : session.id)}
            />
          ))
        )}
      </SurfaceCard>
    </div>
  );
}

function VisitEntry({
  session,
  note,
  isLast,
  open,
  onToggle,
}: {
  session: Session;
  note: Note | undefined;
  isLast: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const tone: StatusTone = note?.finalized ? 'on-track' : note ? 'next' : 'done';
  const label = note?.finalized ? 'Signed' : note ? 'Draft note' : 'No note';
  const filled = note?.sections.filter((s) => s.body.trim().length > 0) ?? [];

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 120px 1fr auto auto auto',
          gap: 14,
          alignItems: 'center',
          padding: '12px 16px',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse note' : 'Expand note'}
          disabled={!note}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 2,
            color: note ? 'var(--color-pt-text-2)' : 'var(--color-pt-text-3)',
            cursor: note ? 'pointer' : 'default',
            opacity: note ? 1 : 0.35,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-pt-text-2)',
          }}
        >
          {fmtIsoDateOptional(session.date)}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontSize: 'var(--text-base)', color: 'var(--color-pt-text)', fontWeight: 500 }}
          >
            {labelForType(session.type)}
          </div>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-pt-text-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.durationMin ? `${session.durationMin} min · ` : ''}
            {session.transcript?.slice(0, 80).trim() || 'No transcript'}
          </div>
        </div>

        <StatusBadge tone={tone} label={label} />

        {note && !note.finalized ? (
          <button
            type="button"
            onClick={() => navigate(`/sessions/${note.sessionId}?tab=review`)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--color-pt-amber-border)',
              background: 'var(--color-pt-amber-soft)',
              color: 'var(--color-pt-amber-fg)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Review &amp; sign
          </button>
        ) : (
          <Link
            to={`/sessions/${session.id}`}
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-pt-text-3)',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Open
          </Link>
        )}

        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-pt-text-3)',
            textAlign: 'right',
            minWidth: 72,
          }}
        >
          {relativeFromNow(session.date)}
        </span>
      </div>

      {open && note && (
        <div
          style={{
            padding: '0 16px 16px 44px',
            display: 'grid',
            gap: 12,
          }}
        >
          {filled.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}>
              This note has no content yet.
            </div>
          ) : (
            filled.map((s) => (
              <div key={s.key}>
                <div
                  style={{
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--color-pt-text-3)',
                  }}
                >
                  {s.label}
                </div>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.55,
                    color: 'var(--color-pt-text-2)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {s.body}
                </p>
              </div>
            ))
          )}
          <Link
            to={`/sessions/${note.sessionId}?tab=review`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-pt-accent-fg)',
              textDecoration: 'none',
            }}
          >
            <FileText size={12} strokeWidth={2} /> Open full note
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '4px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
        background: active ? 'var(--color-pt-accent-soft)' : 'transparent',
        color: active ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
