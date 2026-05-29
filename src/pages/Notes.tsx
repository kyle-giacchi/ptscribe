import { memo, useRef, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
import { shortLabelForType } from '@/utils/labels';
import { useDebounce } from '@/hooks/useDebounce';
import type { Note, Patient, Session } from '@/types';

type StatusFilter = 'all' | 'draft' | 'finalized';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Awaiting sign' },
  { value: 'finalized', label: 'Signed' },
];

const NOTE_ROW_HEIGHT = 58;

interface NoteRowData {
  note: Note;
  patient: Patient | undefined;
  session: Session | undefined;
}

export function Notes() {
  const { notes } = useNotes();
  const { patients } = usePatients();
  const { sessions } = useSessions();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const debouncedQuery = useDebounce(query, 250);

  const patById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const sessById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const rows = useMemo<NoteRowData[]>(() => {
    const q = debouncedQuery.trim().toLowerCase();
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
        const hay =
          `${patient?.firstName ?? ''} ${patient?.lastName ?? ''} ${note.format}`.toLowerCase();
        if (hay.includes(q)) return true;
        return note.sections.some((s) => s.body.toLowerCase().includes(q));
      })
      .sort((a, b) => b.note.updatedAt - a.note.updatedAt);
  }, [notes, patById, sessById, debouncedQuery, statusFilter]);

  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => NOTE_ROW_HEIGHT,
    overscan: 8,
  });

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
          <div
            ref={listRef}
            style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto', overflowX: 'hidden' }}
          >
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={rows[virtualRow.index].note.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <NoteRow
                    data={rows[virtualRow.index]}
                    isLast={virtualRow.index === rows.length - 1}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

const TableHeader = memo(function TableHeader() {
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
});

const NoteRow = memo(function NoteRow({ data, isLast }: { data: NoteRowData; isLast: boolean }) {
  const { note, patient, session } = data;
  const tone = noteTone(note, session?.date);
  const label = note.finalized ? 'Signed' : tone === 'flagged' ? 'Overdue' : 'Awaiting sign';
  const fullName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient';

  return (
    <Link to={`/sessions/${note.sessionId}`} style={{ textDecoration: 'none' }}>
      <div
        className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{
          display: 'grid',
          gridTemplateColumns: '36px 1.6fr 1fr 1fr 130px',
          gap: 14,
          padding: '12px 18px',
          alignItems: 'center',
          borderBottom: isLast ? 'none' : '1px solid var(--color-pt-border)',
          cursor: 'pointer',
        }}
      >
        <Avatar name={fullName} size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-pt-text)' }}>
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
            {session ? ` · ${shortLabelForType(session.type)}` : ''}
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
});

function noteTone(note: { finalized: boolean; updatedAt: number }, visitDate?: number): StatusTone {
  if (note.finalized) return 'done';
  const ageDays = (Date.now() - (visitDate ?? note.updatedAt)) / (24 * 60 * 60 * 1000);
  if (ageDays > 2) return 'flagged';
  if (ageDays > 1) return 'plateau';
  return 'next';
}

function snippet(text?: string): string {
  if (!text) return '';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}
