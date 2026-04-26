import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Mic, Users, FileText, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';

const DAY_MS = 24 * 60 * 60 * 1000;

export function Dashboard() {
  const { patients } = usePatients();
  const { sessions } = useSessions();
  const { notes } = useNotes();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const todaysSessions = sessions.filter((s) => s.date >= today && s.date < today + DAY_MS);
  const recent = [...sessions].sort((a, b) => b.date - a.date).slice(0, 6);
  const draftNotes = notes.filter((n) => !n.finalized).slice(0, 5);
  const activePatients = patients.filter((p) => p.status === 'active');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Today"
        subtitle="A calm look at sessions, notes, and what needs your attention."
        Icon={LayoutDashboard}
        actions={
          <Link to="/sessions/new" className="btn btn-primary">
            <Mic size={14} strokeWidth={2} /> New session
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Active patients" value={activePatients.length} icon={<Users size={14} />} />
        <Stat label="Sessions today" value={todaysSessions.length} icon={<Mic size={14} />} />
        <Stat label="Draft notes" value={draftNotes.length} icon={<FileText size={14} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card space-y-3">
          <SectionHeading title="Recent sessions" />
          {recent.length === 0 ? (
            <EmptyHint>
              No sessions yet. Add a patient and{' '}
              <Link to="/sessions/new" className="underline" style={{ color: 'var(--color-accent-deep)' }}>
                start a new session
              </Link>
              .
            </EmptyHint>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border-soft)' }}>
              {recent.map((s) => {
                const patient = patients.find((p) => p.id === s.patientId);
                return (
                  <li key={s.id} className="py-2.5">
                    <Link
                      to={`/sessions/${s.id}`}
                      className="flex items-center justify-between gap-3 text-sm hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <div className="font-medium" style={{ color: 'var(--color-fg)' }}>
                          {patient
                            ? `${patient.firstName} ${patient.lastName}`
                            : 'Unknown patient'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                          {labelFor(s.type)} · {new Date(s.date).toLocaleString()} ·{' '}
                          {labelForStatus(s.status)}
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: 'var(--color-fg-subtle)' }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <SectionHeading title="Drafts to finalize" />
          {draftNotes.length === 0 ? (
            <EmptyHint>You’re caught up.</EmptyHint>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border-soft)' }}>
              {draftNotes.map((n) => {
                const patient = patients.find((p) => p.id === n.patientId);
                return (
                  <li key={n.id} className="py-2.5">
                    <Link
                      to={`/sessions/${n.sessionId}`}
                      className="flex items-center justify-between gap-3 text-sm hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <div className="font-medium" style={{ color: 'var(--color-fg)' }}>
                          {patient
                            ? `${patient.firstName} ${patient.lastName}`
                            : 'Unknown patient'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                          {n.format.toUpperCase()} · {new Date(n.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: 'var(--color-fg-subtle)' }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-deep)' }}
      >
        {icon}
      </div>
      <div>
        <div className="font-display text-2xl leading-none" style={{ color: 'var(--color-fg)' }}>
          {value}
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--color-fg-muted)' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
        {title}
      </h2>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
      {children}
    </p>
  );
}

function labelFor(t: string): string {
  switch (t) {
    case 'evaluation':
      return 'Initial Eval';
    case 'follow_up':
      return 'Follow-up';
    case 'progress':
      return 'Progress';
    case 'discharge':
      return 'Discharge';
    default:
      return t;
  }
}

function labelForStatus(s: string): string {
  switch (s) {
    case 'finalized':
      return 'Finalized';
    case 'ready':
      return 'Ready to finalize';
    case 'generating':
      return 'Generating note…';
    case 'transcribing':
      return 'Transcribing…';
    case 'recording':
      return 'Recording…';
    case 'draft':
    default:
      return 'Draft';
  }
}
