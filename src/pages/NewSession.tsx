import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mic,
  ArrowLeft,
  Plus,
  ClipboardPlus,
  Repeat,
  TrendingUp,
  ClipboardCheck,
  Check,
  Search,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import {
  Avatar,
  Eyebrow,
  PtButton,
  SurfaceCard,
} from '@/components/design';
import { duration, ease } from '@/lib/motion';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { newId } from '@/utils/ids';
import type { NoteFormat, NoteTemplate, Patient, Session, SessionType } from '@/types';

function isSameDay(tsA: number, tsB: number): boolean {
  const a = new Date(tsA);
  const b = new Date(tsB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function labelForSessionType(t: SessionType): string {
  switch (t) {
    case 'evaluation': return 'Initial evaluation';
    case 'progress':   return 'Progress note';
    case 'discharge':  return 'Discharge';
    default:           return 'Follow-up';
  }
}

const TYPE_TO_FORMAT: Record<SessionType, NoteFormat> = {
  evaluation: 'evaluation',
  follow_up: 'soap',
  progress: 'progress',
  discharge: 'discharge',
};

const VISIT_TYPES: {
  type: SessionType;
  title: string;
  description: string;
  Icon: LucideIcon;
}[] = [
  {
    type: 'evaluation',
    title: 'Initial evaluation',
    description: 'New patient — full assessment',
    Icon: ClipboardPlus,
  },
  {
    type: 'follow_up',
    title: 'Follow-up',
    description: 'SOAP visit between milestones',
    Icon: Repeat,
  },
  {
    type: 'progress',
    title: 'Progress note',
    description: 'Re-assessment or milestone check',
    Icon: TrendingUp,
  },
  {
    type: 'discharge',
    title: 'Discharge',
    description: 'Final visit — outcomes summary',
    Icon: ClipboardCheck,
  },
];

export function NewSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { patients } = usePatients();
  const { forPatient: sessionsForPatient, addSession } = useSessions();
  const { templates, addTemplate } = useTemplates();

  const [patientId, setPatientId] = useState(params.get('patientId') ?? '');
  const [sessionType, setSessionType] = useState<SessionType>('follow_up');
  const [templateId, setTemplateId] = useState<string>('');
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
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
    setShowAllTemplates(false);
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
    setShowAllTemplates(true);
    setCreatingTemplate(false);
    toast.success('Template created — refine it any time on the Templates page.');
  }

  return (
    <div style={{ padding: 22, display: 'grid', gap: 16, maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--color-pt-text-3)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} strokeWidth={2} /> Dashboard
        </Link>
        <Eyebrow>New session</Eyebrow>
      </div>

      {patients.length === 0 ? (
        <SurfaceCard padding={28}>
          <div
            style={{
              display: 'grid',
              justifyItems: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >
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
          <SurfaceCard padding={18}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Eyebrow>Patient</Eyebrow>
                <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
                  {filteredPatients.length}{' '}
                  {filteredPatients.length === 1 ? 'patient' : 'patients'}
                </span>
              </div>
              <div style={{ position: 'relative' }}>
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
                  placeholder="Search patients…"
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
              {filteredPatients.length === 0 ? (
                <div
                  style={{
                    padding: '20px 12px',
                    border: '1px dashed var(--color-pt-border)',
                    borderRadius: 10,
                    textAlign: 'center',
                    fontSize: 12.5,
                    color: 'var(--color-pt-text-3)',
                  }}
                >
                  No matching patients.
                </div>
              ) : (
                <ul
                  role="radiogroup"
                  aria-label="Patient"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 8,
                    maxHeight: 280,
                    overflowY: 'auto',
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                  }}
                >
                  {filteredPatients.map((p) => (
                    <PatientChip
                      key={p.id}
                      patient={p}
                      selected={p.id === patientId}
                      onSelect={() => setPatientId(p.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard padding={18}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Eyebrow>Visit type</Eyebrow>
                <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
                  Drives the note structure
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Visit type"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 8,
                }}
              >
                {VISIT_TYPES.map((vt) => (
                  <VisitTypeCard
                    key={vt.type}
                    visitType={vt}
                    selected={vt.type === sessionType}
                    onSelect={() => chooseVisitType(vt.type)}
                  />
                ))}
              </div>

              <TemplateSection
                sessionType={sessionType}
                visitTemplates={visitTemplates}
                effectiveTemplateId={effectiveTemplateId}
                showAllTemplates={showAllTemplates}
                onPickTemplate={setTemplateId}
                onShowAll={() => setShowAllTemplates(true)}
                onCreate={() => setCreatingTemplate(true)}
              />
            </div>
          </SurfaceCard>

          <StartBar
            patient={selectedPatient}
            visitTitle={
              VISIT_TYPES.find((v) => v.type === sessionType)?.title ?? ''
            }
            disabled={!patientId}
            onStart={handleStart}
          />
        </>
      )}

      <NewTemplateModal
        open={creatingTemplate}
        visitTypeLabel={
          VISIT_TYPES.find((v) => v.type === sessionType)?.title ?? ''
        }
        onClose={() => setCreatingTemplate(false)}
        onCreate={handleCreateTemplate}
      />

      <SameDayModal
        sessions={sameDayModal}
        patient={selectedPatient}
        onClose={() => setSameDayModal(null)}
        onContinue={(sessionId) => navigate(`/sessions/${sessionId}`)}
        onCreateNew={() => { setSameDayModal(null); doCreateSession(); }}
      />
    </div>
  );
}

function PatientChip({
  patient,
  selected,
  onSelect,
}: {
  patient: Patient;
  selected: boolean;
  onSelect: () => void;
}) {
  const fullName = `${patient.firstName} ${patient.lastName}`;
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '9px 12px',
          paddingRight: 28,
          borderRadius: 10,
          border: `1px solid ${selected ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
          background: selected ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        <Avatar name={fullName} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {patient.lastName}, {patient.firstName}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--color-pt-text-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 1,
            }}
          >
            {patient.primaryDiagnosis ?? 'No primary diagnosis'}
          </div>
        </div>
        {selected && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: 8,
              top: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--color-pt-accent)',
              color: '#ffffff',
            }}
          >
            <Check size={10} strokeWidth={3} />
          </span>
        )}
      </button>
    </li>
  );
}

function VisitTypeCard({
  visitType,
  selected,
  onSelect,
}: {
  visitType: (typeof VISIT_TYPES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const { title, description, Icon } = visitType;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${selected ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
        background: selected ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <span
        style={{
          marginTop: 2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 10,
          background: selected ? 'var(--color-pt-accent)' : 'var(--color-pt-surface-mut)',
          color: selected ? '#ffffff' : 'var(--color-pt-text-2)',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={2} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 13.5,
            fontWeight: 600,
            color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--color-pt-text-3)',
            marginTop: 2,
          }}
        >
          {description}
        </span>
      </span>
    </button>
  );
}

function TemplateSection({
  sessionType,
  visitTemplates,
  effectiveTemplateId,
  showAllTemplates,
  onPickTemplate,
  onShowAll,
  onCreate,
}: {
  sessionType: SessionType;
  visitTemplates: NoteTemplate[];
  effectiveTemplateId: string;
  showAllTemplates: boolean;
  onPickTemplate: (id: string) => void;
  onShowAll: () => void;
  onCreate: () => void;
}) {
  const isEmpty = visitTemplates.length === 0;
  const showCompact = !isEmpty && (visitTemplates.length === 1 || !showAllTemplates);
  const compactTemplate =
    visitTemplates.find((t) => t.id === effectiveTemplateId) ?? visitTemplates[0];
  return (
    <div
      style={{
        borderTop: '1px solid var(--color-pt-border)',
        paddingTop: 14,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={sessionType}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: duration.base, ease: ease.enter }}
          style={{ display: 'grid', gap: 10 }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Eyebrow>Template</Eyebrow>
            <button
              type="button"
              onClick={onCreate}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 11.5,
                color: 'var(--color-pt-accent-fg)',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              <Plus size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
              New custom template
            </button>
          </div>

          {isEmpty && (
            <div
              style={{
                border: '1px dashed var(--color-pt-border)',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                color: 'var(--color-pt-text-3)',
              }}
            >
              No templates available for this visit type. Create one to continue, or
              start without a template.
            </div>
          )}

          {showCompact && (
            <CompactTemplate
              template={compactTemplate}
              hasMore={visitTemplates.length > 1}
              onChange={onShowAll}
            />
          )}

          {!isEmpty && !showCompact && (
            <ul style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
              {visitTemplates.map((t) => (
                <TemplateOption
                  key={t.id}
                  template={t}
                  selected={t.id === effectiveTemplateId}
                  onSelect={() => onPickTemplate(t.id)}
                />
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TemplateOption({
  template,
  selected,
  onSelect,
}: {
  template: NoteTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          borderRadius: 10,
          border: `1px solid ${selected ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
          background: selected ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
          textAlign: 'left',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `1px solid ${selected ? 'var(--color-pt-accent)' : 'var(--color-pt-border)'}`,
              background: selected ? 'var(--color-pt-accent)' : 'transparent',
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            {selected && <Check size={10} strokeWidth={3} />}
          </span>
          <span
            style={{
              fontWeight: 600,
              color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {template.name}
          </span>
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-3)',
          }}
        >
          {template.builtin ? 'Built-in' : 'Custom'} · {template.sections.length} sections
        </span>
      </button>
    </li>
  );
}

function CompactTemplate({
  template,
  hasMore,
  onChange,
}: {
  template: NoteTemplate | undefined;
  hasMore: boolean;
  onChange: () => void;
}) {
  if (!template) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-pt-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {template.name}
          </span>
          <span
            style={{
              flexShrink: 0,
              padding: '2px 7px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'var(--color-pt-accent-soft)',
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            {template.builtin ? 'Built-in' : 'Custom'}
          </span>
        </div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
          {template.sections.length} sections
        </div>
      </div>
      {hasMore && (
        <PtButton variant="ghost" onClick={onChange} style={{ padding: '6px 10px', fontSize: 12 }}>
          Change
        </PtButton>
      )}
    </div>
  );
}

function StartBar({
  patient,
  visitTitle,
  disabled,
  onStart,
}: {
  patient: Patient | undefined;
  visitTitle: string;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <SurfaceCard padding={14}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          {patient ? (
            <>
              Starting{' '}
              <span style={{ color: 'var(--color-pt-text)', fontWeight: 600 }}>
                {patient.firstName} {patient.lastName}
              </span>{' '}
              · {visitTitle.toLowerCase()}
            </>
          ) : (
            <>Pick a patient to continue.</>
          )}
        </p>
        <PtButton
          variant="primary"
          disabled={disabled}
          onClick={onStart}
          iconLeft={<Mic size={14} strokeWidth={2} />}
        >
          Start session
        </PtButton>
      </div>
    </SurfaceCard>
  );
}

function NewTemplateModal({
  open,
  visitTypeLabel,
  onClose,
  onCreate,
}: {
  open: boolean;
  visitTypeLabel: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <Modal
      open={open}
      onClose={() => {
        setName('');
        onClose();
      }}
      title="New custom template"
      size="sm"
    >
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-3)', margin: 0 }}>
        Saved as a {visitTypeLabel.toLowerCase()} template. You can edit
        sections and the AI prompt later from the Templates page.
      </p>
      <Field label="Template name">
        <TextInput
          autoFocus
          value={name}
          placeholder={`My ${visitTypeLabel.toLowerCase()} template`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onCreate(name);
              setName('');
            }
          }}
        />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <PtButton
          variant="ghost"
          onClick={() => {
            setName('');
            onClose();
          }}
        >
          Cancel
        </PtButton>
        <PtButton
          variant="primary"
          disabled={!name.trim()}
          onClick={() => {
            onCreate(name);
            setName('');
          }}
        >
          Create
        </PtButton>
      </div>
    </Modal>
  );
}

function SameDayModal({
  sessions,
  patient,
  onClose,
  onContinue,
  onCreateNew,
}: {
  sessions: Session[] | null;
  patient: Patient | undefined;
  onClose: () => void;
  onContinue: (sessionId: string) => void;
  onCreateNew: () => void;
}) {
  if (!sessions) return null;
  const name = patient ? `${patient.firstName} ${patient.lastName}` : 'this patient';
  return (
    <Modal open onClose={onClose} title="Session already started today" size="sm">
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', margin: 0 }}>
        You have {sessions.length === 1 ? 'an open session' : `${sessions.length} open sessions`} for{' '}
        <strong>{name}</strong> today. Continue where you left off, or start fresh.
      </p>

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        {sessions.map((s) => {
          const time = new Date(s.date).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onContinue(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                border: '1px solid var(--color-pt-accent-border)',
                borderRadius: 10,
                background: 'var(--color-pt-accent-soft)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-accent-fg)' }}>
                  {labelForSessionType(s.type)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', marginTop: 1 }}>
                  Started at {time}
                </div>
              </div>
              <ExternalLink size={14} color="var(--color-pt-accent)" strokeWidth={2} />
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <PtButton variant="ghost" onClick={onCreateNew}>
          Start new session anyway
        </PtButton>
        {sessions.length === 1 && (
          <PtButton variant="primary" onClick={() => onContinue(sessions[0].id)}>
            Continue session
          </PtButton>
        )}
      </div>
    </Modal>
  );
}
