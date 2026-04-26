import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  Avatar,
  Eyebrow,
  SegmentedControl,
  StatusBadge,
  SurfaceCard,
  type StatusTone,
} from '@/components/design';
import { useNotes } from '@/contexts/NotesProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { relativeFromNow } from '@/utils/dates';

type StatusFilter = 'all' | 'draft' | 'finalized';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Awaiting sign' },
  { value: 'finalized', label: 'Signed' },
];

export function Notes() {
  const { notes } = useNotes();
  const { patients } = usePatients();
  const { sessions } = useSessions();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const rows = useMemo(() => {
    const patById = new Map(patients.map((p) => [p.id, p]));
    const sessById = new Map(sessions.map((s) => [s.id, s]));
    const q = query.trim().toLowerCase();
    return notes
      .map((note) => ({
        note,
        patient: patById.get(note.patientId),
        session: sessById.get(note.sessionId),
      }))
      .filter(({ note, patient }) => {
        if (statusFilter === 'draft' && note.finalized) return false;
        if (statusFilter === 'finalized' && !note.finalized) return false;
        if (!q) return true;
        const hay = `${patient?.firstName ?? ''} ${patient?.lastName ?? ''} ${note.format}`.toLowerCase();
        if (hay.includes(q)) return true;
        return note.sections.some((s) => s.body.toLowerCase().includes(q));
      })
      .sort((a, b) => b.note.updatedAt - a.note.updatedAt);
  }, [notes, patients, sessions, query, statusFilter]);

  return (
    <div style={{ padding: 22, display: 'grid', gap: 14, alignContent: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-pt-text-3)',
            }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient or note content"
            style={{
              width: '100%',
              padding: '9px 12px 9px 32px',
              borderRadius: 9,
              border: '1px solid var(--color-pt-border)',
              fontSize: 13,
              color: 'var(--color-pt-text)',
              background: 'var(--color-pt-surface)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <SegmentedControl
          items={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          size="sm"
        />
      </div>

      <SurfaceCard padding={0}>
        <TableHeader />
        {rows.length === 0 ? (
          <div
            style={{
              padding: '28px 18px',
              textAlign: 'center',
              color: 'var(--color-pt-text-3)',
              fontSize: 13,
            }}
          >
            No notes match.
          </div>
        ) : (
          rows.map(({ note, patient, session }, i) => {
            const tone = noteTone(note, session?.date);
            const label = note.finalized
              ? 'Signed'
              : tone === 'flagged'
                ? 'Overdue'
                : 'Awaiting sign';
            const fullName = patient
              ? `${patient.firstName} ${patient.lastName}`
              : 'Unknown patient';
            return (
              <Link
                key={note.id}
                to={`/sessions/${note.sessionId}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 1.6fr 1fr 1fr 130px',
                    gap: 14,
                    padding: '12px 18px',
                    alignItems: 'center',
                    borderBottom:
                      i === rows.length - 1 ? 'none' : '1px solid var(--color-pt-border)',
                    cursor: 'pointer',
                  }}
                >
                  <Avatar name={fullName} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                      }}
                    >
                      {fullName}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--color-pt-text-3)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 1,
                      }}
                    >
                      {note.format.toUpperCase()}
                      {session ? ` · ${labelForType(session.type)}` : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--color-pt-text-2)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {snippet(note.sections.find((s) => s.body)?.body) || '—'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)' }}>
                    {relativeFromNow(note.updatedAt)}
                  </div>
                  <StatusBadge tone={tone} label={label} />
                </div>
              </Link>
            );
          })
        )}
      </SurfaceCard>
    </div>
  );
}

function TableHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1.6fr 1fr 1fr 130px',
        gap: 14,
        padding: '10px 18px',
        borderBottom: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
      }}
    >
      <span />
      <Eyebrow>Patient</Eyebrow>
      <Eyebrow>Note snippet</Eyebrow>
      <Eyebrow>Updated</Eyebrow>
      <Eyebrow>Status</Eyebrow>
    </div>
  );
}

function noteTone(
  note: { finalized: boolean; updatedAt: number },
  visitDate?: number
): StatusTone {
  if (note.finalized) return 'done';
  const ageDays =
    (Date.now() - (visitDate ?? note.updatedAt)) / (24 * 60 * 60 * 1000);
  if (ageDays > 2) return 'flagged';
  if (ageDays > 1) return 'plateau';
  return 'next';
}

function labelForType(t: string): string {
  switch (t) {
    case 'evaluation':
      return 'Eval';
    case 'progress':
      return 'Progress';
    case 'discharge':
      return 'Discharge';
    default:
      return 'Follow-up';
  }
}

function snippet(text?: string): string {
  if (!text) return '';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}
