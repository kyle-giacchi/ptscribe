import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { TextInput, Select } from '@/components/ui/Field';
import { useNotes } from '@/contexts/NotesProvider';
import { usePatients } from '@/contexts/PatientsProvider';

type StatusFilter = 'all' | 'draft' | 'finalized';

export function Notes() {
  const { notes } = useNotes();
  const { patients } = usePatients();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const rows = useMemo(() => {
    const byId = new Map(patients.map((p) => [p.id, p]));
    const q = query.trim().toLowerCase();
    return notes
      .map((n) => {
        const patient = byId.get(n.patientId);
        return { note: n, patient };
      })
      .filter(({ note, patient }) => {
        if (statusFilter === 'draft' && note.finalized) return false;
        if (statusFilter === 'finalized' && !note.finalized) return false;
        if (!q) return true;
        const hay = `${patient?.firstName ?? ''} ${patient?.lastName ?? ''} ${note.format}`.toLowerCase();
        if (hay.includes(q)) return true;
        return note.sections.some((s) => s.body.toLowerCase().includes(q));
      })
      .sort((a, b) => b.note.updatedAt - a.note.updatedAt);
  }, [notes, patients, query, statusFilter]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Notes"
        subtitle="Every draft and finalized note across your caseload."
        Icon={FileText}
      />

      <div className="card flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-fg-subtle)' }}
          />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient or content"
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="md:w-44"
        >
          <option value="all">All notes</option>
          <option value="draft">Drafts only</option>
          <option value="finalized">Finalized only</option>
        </Select>
      </div>

      <div className="card p-0">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: 'var(--color-fg-muted)' }}>
            No notes match.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border-soft)' }}>
            {rows.map(({ note, patient }) => (
              <li key={note.id}>
                <Link
                  to={`/sessions/${note.sessionId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-[var(--color-surface-2)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--color-fg)' }}>
                        {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{
                          background: 'var(--color-surface-2)',
                          color: note.finalized ? 'var(--color-positive)' : 'var(--color-caution)',
                        }}
                      >
                        {note.finalized ? 'Finalized' : 'Draft'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                      {note.format.toUpperCase()} · updated {new Date(note.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--color-fg-subtle)' }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
