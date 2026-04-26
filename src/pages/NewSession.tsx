import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { newId } from '@/utils/ids';
import type { Session, SessionType } from '@/types';

const TYPE_TO_FORMAT: Record<SessionType, string> = {
  evaluation: 'evaluation',
  follow_up: 'soap',
  progress: 'progress',
  discharge: 'discharge',
};

export function NewSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { patients } = usePatients();
  const { addSession } = useSessions();
  const { templates } = useTemplates();

  const [patientId, setPatientId] = useState(params.get('patientId') ?? '');
  const [sessionType, setSessionType] = useState<SessionType>('follow_up');
  const [templateId, setTemplateId] = useState('');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => p.status !== 'discharged')
      .filter((p) =>
        q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
  }, [patients, query]);

  // Default template = the first one matching the format implied by session type.
  const effectiveTemplateId =
    templateId ||
    templates.find((t) => t.format === TYPE_TO_FORMAT[sessionType])?.id ||
    templates[0]?.id ||
    '';

  function handleStart() {
    if (!patientId) return;
    const now = Date.now();
    const session: Session = {
      id: newId(),
      patientId,
      type: sessionType,
      date: now,
      status: 'draft',
      templateId: effectiveTemplateId || undefined,
      createdAt: now,
      updatedAt: now,
    };
    addSession(session);
    navigate(`/sessions/${session.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/" className="btn btn-ghost w-fit">
        <ArrowLeft size={14} strokeWidth={2} /> Dashboard
      </Link>

      <PageHeader
        title="New session"
        subtitle="Pick a patient and a template, then record."
        Icon={Mic}
      />

      {patients.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
            You need a patient before you can start a session.
          </p>
          <Link to="/patients" className="btn btn-primary">
            <Plus size={14} strokeWidth={2} /> Add a patient
          </Link>
        </div>
      ) : (
        <>
          <section className="card space-y-3">
            <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
              Patient
            </h2>
            <TextInput
              placeholder="Search patients…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul
              className="max-h-72 divide-y overflow-y-auto rounded-lg border"
              style={{ borderColor: 'var(--color-border-soft)' }}
            >
              {filtered.length === 0 && (
                <li
                  className="px-3 py-4 text-center text-sm"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  No matching patients.
                </li>
              )}
              {filtered.map((p) => {
                const selected = p.id === patientId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPatientId(p.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
                      style={{
                        background: selected ? 'var(--color-accent-soft)' : undefined,
                        color: selected ? 'var(--color-accent-fg)' : 'var(--color-fg)',
                      }}
                    >
                      <span className="font-medium">
                        {p.lastName}, {p.firstName}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                        {p.primaryDiagnosis ?? '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card space-y-3">
            <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
              Visit type & template
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Visit type">
                <Select
                  value={sessionType}
                  onChange={(e) => {
                    setSessionType(e.target.value as SessionType);
                    setTemplateId('');
                  }}
                >
                  <option value="evaluation">Initial Evaluation</option>
                  <option value="follow_up">Follow-up (SOAP)</option>
                  <option value="progress">Progress note</option>
                  <option value="discharge">Discharge</option>
                </Select>
              </Field>
              <Field label="Template">
                <Select
                  value={effectiveTemplateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.builtin ? '' : ' (custom)'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!patientId}
              onClick={handleStart}
            >
              <Mic size={14} strokeWidth={2} /> Start session
            </button>
          </div>
        </>
      )}
    </div>
  );
}
