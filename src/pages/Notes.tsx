import { memo, useRef, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Avatar,
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
import { shortName } from '@/utils/patients';
import { useDebounce } from '@/hooks/useDebounce';
import type { Note, Patient, Session } from '@/types';

type StatusFilter = 'all' | 'draft' | 'finalized';
type SortKey = 'patient' | 'visit' | 'updated' | 'status';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Awaiting sign' },
  { value: 'finalized', label: 'Signed' },
];

const NOTE_ROW_HEIGHT = 52;

/** Single source of truth for the grid — header and rows can't drift apart. */
const COLS: { key: SortKey | 'avatar' | 'snippet'; label: string; width: string }[] = [
  { key: 'avatar', label: '', width: '34px' },
  { key: 'visit', label: 'Visit date', width: '118px' },
  { key: 'patient', label: 'Patient', width: 'minmax(150px, 1.3fr)' },
  { key: 'snippet', label: 'Note snippet', width: 'minmax(0, 1.8fr)' },
  { key: 'updated', label: 'Edited', width: '88px' },
  { key: 'status', label: 'Status', width: '124px' },
];
const SORTABLE = new Set<string>(['patient', 'visit', 'updated', 'status']);
const GRID = COLS.map((c) => c.width).join(' ');
const GRID_MIN_WIDTH = 720;

interface NoteRowData {
  note: Note;
  patient: Patient | undefined;
  session: Session | undefined;
  visitDate: number;
  tone: StatusTone;
}

export function Notes() {
  const { notes } = useNotes();
  const { patients } = usePatients();
  const { sessions } = useSessions();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('draft');
  // Oldest visit first — the review queue is worked oldest-down.
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'visit', dir: 1 });
  const debouncedQuery = useDebounce(query, 250);

  const patById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const sessById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const rows = useMemo<NoteRowData[]>(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return notes
      .map((note) => {
        const session = sessById.get(note.sessionId);
        const visitDate = session?.date ?? note.updatedAt;
        return {
          note,
          session,
          visitDate,
          patient: patById.get(note.patientId),
          tone: noteTone(note, visitDate),
        };
      })
      .filter(({ note, patient }) => {
        if (statusFilter === 'draft' && note.finalized) return false;
        if (statusFilter === 'finalized' && !note.finalized) return false;
        if (!q) return true;
        const hay =
          `${patient?.firstName ?? ''} ${patient?.lastName ?? ''} ${note.format}`.toLowerCase();
        if (hay.includes(q)) return true;
        return note.sections.some((s) => s.body.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const d = compare(a, b, sort.key) * sort.dir;
        // Patient + visit date is the unique key — tie-break so order is stable.
        return d !== 0 ? d : (a.visitDate - b.visitDate) * sort.dir;
      });
  }, [notes, patById, sessById, debouncedQuery, statusFilter, sort]);

  const pending = useMemo(() => rows.filter((r) => !r.note.finalized).length, [rows]);
  const overdue = useMemo(() => rows.filter((r) => r.tone === 'flagged').length, [rows]);

  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => NOTE_ROW_HEIGHT,
    overscan: 8,
  });

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : defaultDir(key) }));

  return (
    <div style={{ padding: 22, display: 'grid', gap: 12, alignContent: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
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
              fontSize: 'var(--text-base)',
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
        <div
          className="tnum"
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-pt-text-2)',
          }}
        >
          {rows.length} shown · {pending} awaiting sign
          {overdue > 0 && (
            <span style={{ color: 'var(--color-pt-red-fg)' }}> · {overdue} overdue</span>
          )}
        </div>
      </div>

      <SurfaceCard padding={0}>
        <div
          ref={listRef}
          style={{ maxHeight: 'calc(100vh - 230px)', overflow: 'auto' }}
          role="grid"
          aria-rowcount={rows.length}
        >
          <div style={{ minWidth: GRID_MIN_WIDTH }}>
            <TableHeader sort={sort} onSort={toggleSort} />
            {rows.length === 0 ? (
              <div
                style={{
                  padding: '32px 18px',
                  textAlign: 'center',
                  color: 'var(--color-pt-text-3)',
                  fontSize: 'var(--text-base)',
                }}
              >
                {notes.length === 0 ? 'No notes yet.' : 'No notes match these filters.'}
              </div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={rows[virtualRow.index].note.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: NOTE_ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <NoteRow data={rows[virtualRow.index]} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

const TableHeader = memo(function TableHeader({
  sort,
  onSort,
}: {
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 12,
        padding: '0 16px',
        height: 34,
        alignItems: 'center',
        borderBottom: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      {COLS.map((col) => {
        const label = (
          <span
            style={{
              fontSize: 'var(--text-2xs)',
              fontWeight: 600,
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              color: 'var(--color-pt-text-3)',
            }}
          >
            {col.label}
          </span>
        );
        if (!SORTABLE.has(col.key)) return <div key={col.key}>{col.label ? label : null}</div>;
        const active = sort.key === col.key;
        return (
          <button
            key={col.key}
            type="button"
            onClick={() => onSort(col.key as SortKey)}
            aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
            className="transition-colors hover:text-[var(--color-pt-text)]"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: 0,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              font: 'inherit',
              color: active ? 'var(--color-pt-text-2)' : 'inherit',
              textAlign: 'left',
            }}
          >
            {label}
            {active &&
              (sort.dir === 1 ? (
                <ChevronUp size={11} color="var(--color-pt-accent)" />
              ) : (
                <ChevronDown size={11} color="var(--color-pt-accent)" />
              ))}
          </button>
        );
      })}
    </div>
  );
});

const NoteRow = memo(function NoteRow({ data }: { data: NoteRowData }) {
  const { note, patient, session, visitDate, tone } = data;
  const label = note.finalized ? 'Signed' : tone === 'flagged' ? 'Overdue' : 'Awaiting sign';
  const fullName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient';
  // Visible text is abbreviated; the row `title` below keeps the full name one
  // hover away for identity confirmation.
  const rowName = patient ? shortName(patient) : 'Unknown patient';
  const rail =
    !note.finalized && (tone === 'flagged' || tone === 'plateau')
      ? tone === 'flagged'
        ? 'var(--color-pt-red)'
        : 'var(--color-pt-amber)'
      : null;

  return (
    <Link
      to={`/sessions/${note.sessionId}?tab=review`}
      title={`${fullName} — ${fmtVisitDate(visitDate)}`}
      className="transition-colors hover:bg-[var(--color-pt-surface-mut)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-pt-accent)]"
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 12,
        padding: '0 16px',
        height: NOTE_ROW_HEIGHT,
        alignItems: 'center',
        borderBottom: '1px solid var(--color-pt-border)',
        textDecoration: 'none',
        boxShadow: rail ? `inset 3px 0 0 ${rail}` : undefined,
      }}
    >
      <Avatar name={fullName} color={patient?.color} size={28} />
      <div className="tnum" style={{ minWidth: 0 }}>
        <div
          style={{ fontSize: 'var(--text-base)', color: 'var(--color-pt-text)', fontWeight: 500 }}
        >
          {fmtVisitDate(visitDate)}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)', marginTop: 1 }}>
          {relativeFromNow(visitDate)}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-pt-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {rowName}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)', marginTop: 1 }}>
          {note.format.toUpperCase()}
          {session ? ` · ${shortLabelForType(session.type)}` : ''}
        </div>
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-pt-text-2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {snippet(note.sections.find((s) => s.body)?.body) || '—'}
      </div>
      <div className="tnum" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}>
        {relativeFromNow(note.updatedAt)}
      </div>
      <StatusBadge tone={tone} label={label} />
    </Link>
  );
});

/** Rank used when sorting by Status — most urgent first under descending. */
const TONE_RANK: Record<StatusTone, number> = {
  flagged: 5,
  plateau: 4,
  next: 3,
  new: 3,
  live: 3,
  upcoming: 2,
  'on-track': 2,
  done: 1,
};

function compare(a: NoteRowData, b: NoteRowData, key: SortKey): number {
  switch (key) {
    case 'patient':
      return sortName(a).localeCompare(sortName(b));
    case 'visit':
      return a.visitDate - b.visitDate;
    case 'updated':
      return a.note.updatedAt - b.note.updatedAt;
    case 'status':
      return TONE_RANK[a.tone] - TONE_RANK[b.tone];
  }
}

function defaultDir(key: SortKey): 1 | -1 {
  // Patient A→Z, visit date oldest-first; recency-ish columns start newest-first.
  return key === 'patient' || key === 'visit' ? 1 : -1;
}

function sortName({ patient }: NoteRowData): string {
  return patient ? `${patient.lastName} ${patient.firstName}`.toLowerCase() : 'zzz';
}

function fmtVisitDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function noteTone(note: { finalized: boolean; updatedAt: number }, visitDate: number): StatusTone {
  if (note.finalized) return 'done';
  const ageDays = (Date.now() - visitDate) / (24 * 60 * 60 * 1000);
  if (ageDays > 2) return 'flagged';
  if (ageDays > 1) return 'plateau';
  return 'next';
}

function snippet(text?: string): string {
  if (!text) return '';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}
