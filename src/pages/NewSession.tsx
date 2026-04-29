import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Search,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { newId } from '@/utils/ids';
import { isSameDay } from '@/utils/dates';
import { useToggle } from '@/hooks/useToggle';
import { PatientRow } from '@/components/new-session/PatientRow';
import { TemplateSection } from '@/components/new-session/TemplateSection';
import { StartBar } from '@/components/new-session/StartBar';
import { NewTemplateModal } from '@/components/new-session/NewTemplateModal';
import { SameDayModal } from '@/components/new-session/SameDayModal';
import type { NoteFormat, NoteTemplate, Patient, Session, SessionType } from '@/types';

const TYPE_TO_FORMAT: Record<SessionType, NoteFormat> = {
  evaluation: 'evaluation',
  follow_up: 'soap',
  progress: 'progress',
  discharge: 'discharge',
};

const VISIT_TYPES: { type: SessionType; title: string }[] = [
  { type: 'evaluation', title: 'Initial eval' },
  { type: 'follow_up', title: 'Follow-up' },
  { type: 'progress', title: 'Progress note' },
  { type: 'discharge', title: 'Discharge' },
];

export function NewSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { patients, addPatient } = usePatients();
  const { forPatient: sessionsForPatient, addSession } = useSessions();
  const { templates, addTemplate } = useTemplates();

  const [patientId, setPatientId] = useState(params.get('patientId') ?? '');
  const [sessionType, setSessionType] = useState<SessionType>('follow_up');
  const [templateId, setTemplateId] = useState<string>('');
  const [showAllTemplates, showAllTemplatesOn, showAllTemplatesOff] = useToggle();
  const [creatingTemplate, openCreatingTemplate, closeCreatingTemplate] = useToggle();
  const [query, setQuery] = useState('');
  const [sameDayModal, setSameDayModal] = useState<Session[] | null>(null);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId],
  );

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => p.status !== 'discharged')
      .filter((p) =>
        q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) =>
        `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
      );
  }, [patients, query]);

  const visitTemplates = useMemo(() => {
    const fmt = TYPE_TO_FORMAT[sessionType];
    return templates
      .filter((t) => t.format === fmt)
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name));
  }, [templates, sessionType]);

  const effectiveTemplateId =
    (templateId && visitTemplates.find((t) => t.id === templateId)?.id) ||
    visitTemplates[0]?.id ||
    '';

  function chooseVisitType(next: SessionType) {
    if (next === sessionType) return;
    setSessionType(next);
    setTemplateId('');
    showAllTemplatesOff();
  }

  function doCreateSession() {
    const now = Date.now();
    const session: Session = {
      id: newId(),
      patientId,
      type: sessionType,
      date: now,
      status: 'draft',
      clips: [],
      templateId: effectiveTemplateId || undefined,
      createdAt: now,
      updatedAt: now,
    };
    addSession(session);
    navigate(`/sessions/${session.id}`);
  }

  function handleStart() {
    if (!patientId) return;
    const todaySessions = sessionsForPatient(patientId).filter(
      (s) => s.status !== 'finalized' && isSameDay(s.date, Date.now()),
    );
    if (todaySessions.length > 0) {
      setSameDayModal(todaySessions);
    } else {
      doCreateSession();
    }
  }

  function handleQuickAddPatient() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    const now = Date.now();
    const patient: Patient = {
      id: newId(),
      firstName,
      lastName,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    addPatient(patient);
    setPatientId(patient.id);
    setQuery('');
    toast.success(`${firstName} added — fill in details any time from Patients.`);
  }

  function handleCreateTemplate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    const tpl: NoteTemplate = {
      id: newId(),
      name: trimmed,
      format: TYPE_TO_FORMAT[sessionType],
      sections: [{ key: 'body', label: 'Body', promptHint: '' }],
      systemPrompt:
        'You are a clinical scribe. Return a JSON object whose keys match the provided section keys; each value is the section text in plain prose.',
      builtin: false,
      createdAt: now,
      updatedAt: now,
    };
    addTemplate(tpl);
    setTemplateId(tpl.id);
    showAllTemplatesOn();
    closeCreatingTemplate();
    toast.success('Template created — refine it any time on the Templates page.');
  }

  return (
    <div style={{ padding: '20px 22px', display: 'grid', gap: 14, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: 'var(--color-pt-text-3)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={13} strokeWidth={2} /> Dashboard
        </Link>
        <span style={{ flex: 1 }} />
        <Eyebrow>New session</Eyebrow>
      </div>

      {patients.length === 0 ? (
        <SurfaceCard padding={28}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--color-pt-text-3)', margin: 0 }}>
              You need a patient before you can start a session.
            </p>
            <Link to="/patients" style={{ textDecoration: 'none' }}>
              <PtButton variant="primary" iconLeft={<Plus size={14} strokeWidth={2} />}>
                Add a patient
              </PtButton>
            </Link>
          </div>
        </SurfaceCard>
      ) : (
        <>
          {/* Patient */}
          <SurfaceCard>
            <div style={{ padding: '14px 16px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Eyebrow>Patient</Eyebrow>
                {selectedPatient && (
                  <span style={{ fontSize: 11.5, color: 'var(--color-pt-accent-fg)', fontWeight: 500 }}>
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-pt-text-3)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search patients…"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '9px 10px 9px 30px',
                    borderRadius: 8,
                    border: '1px solid var(--color-pt-border)',
                    fontSize: 13,
                    color: 'var(--color-pt-text)',
                    background: 'var(--color-pt-surface-mut)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {filteredPatients.length > 0 ? (
              <ul
                role="radiogroup"
                aria-label="Patient"
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  maxHeight: 256,
                  overflowY: 'auto',
                  borderTop: '1px solid var(--color-pt-border)',
                }}
              >
                {filteredPatients.map((p) => (
                  <PatientRow
                    key={p.id}
                    patient={p}
                    selected={p.id === patientId}
                    onSelect={() => setPatientId(p.id)}
                  />
                ))}
              </ul>
            ) : (
              <div style={{ borderTop: '1px solid var(--color-pt-border)', padding: '12px 16px' }}>
                {query.trim() ? (
                  <button
                    type="button"
                    onClick={handleQuickAddPatient}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 13,
                      color: 'var(--color-pt-accent-fg)',
                      fontWeight: 500,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <UserPlus size={14} strokeWidth={2} />
                    Add "{query.trim()}" as a new patient
                  </button>
                ) : (
                  <span style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>
                    No active patients.
                  </span>
                )}
              </div>
            )}
          </SurfaceCard>

          {/* Visit type + Template */}
          <SurfaceCard padding={16}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ marginBottom: 10 }}>
                  <Eyebrow>Visit type</Eyebrow>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Visit type"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                >
                  {VISIT_TYPES.map((vt) => {
                    const active = vt.type === sessionType;
                    return (
                      <button
                        key={vt.type}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => chooseVisitType(vt.type)}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 20,
                          border: `1px solid ${active ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
                          background: active ? 'var(--color-pt-accent)' : 'var(--color-pt-surface)',
                          color: active ? '#ffffff' : 'var(--color-pt-text-2)',
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                          whiteSpace: 'nowrap',
                          minHeight: 36,
                          lineHeight: 1,
                        }}
                      >
                        {vt.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              <TemplateSection
                sessionType={sessionType}
                visitTemplates={visitTemplates}
                effectiveTemplateId={effectiveTemplateId}
                showAllTemplates={showAllTemplates}
                onPickTemplate={setTemplateId}
                onShowAll={showAllTemplatesOn}
                onCreate={openCreatingTemplate}
              />
            </div>
          </SurfaceCard>

          <StartBar
            patient={selectedPatient}
            visitTitle={VISIT_TYPES.find((v) => v.type === sessionType)?.title ?? ''}
            disabled={!patientId}
            onStart={handleStart}
          />
        </>
      )}

      <NewTemplateModal
        open={creatingTemplate}
        visitTypeLabel={VISIT_TYPES.find((v) => v.type === sessionType)?.title ?? ''}
        onClose={closeCreatingTemplate}
        onCreate={handleCreateTemplate}
      />

      <SameDayModal
        sessions={sameDayModal}
        patient={selectedPatient}
        onClose={() => setSameDayModal(null)}
        onContinue={(sessionId) => navigate(`/sessions/${sessionId}`)}
        onCreateNew={() => {
          setSameDayModal(null);
          doCreateSession();
        }}
      />
    </div>
  );
}
