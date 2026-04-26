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
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { duration, ease } from '@/lib/motion';
import { usePatients } from '@/contexts/PatientsProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { newId } from '@/utils/ids';
import type { NoteFormat, NoteTemplate, Session, SessionType } from '@/types';

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
  const { addSession } = useSessions();
  const { templates, addTemplate } = useTemplates();

  const [patientId, setPatientId] = useState(params.get('patientId') ?? '');
  const [sessionType, setSessionType] = useState<SessionType>('follow_up');
  const [templateId, setTemplateId] = useState<string>('');
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [query, setQuery] = useState('');

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

  // Templates scoped to the current visit type. Built-ins surface first.
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
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/" className="btn btn-ghost w-fit">
        <ArrowLeft size={14} strokeWidth={2} /> Dashboard
      </Link>

      <PageHeader
        title="New session"
        subtitle="Pick a patient, choose the visit type, then start recording."
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
              {filteredPatients.length === 0 && (
                <li
                  className="px-3 py-4 text-center text-sm"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  No matching patients.
                </li>
              )}
              {filteredPatients.map((p) => {
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

          <section className="card space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
                Visit type
              </h2>
              <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                Drives the note structure
              </span>
            </div>

            <div
              className="grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Visit type"
            >
              {VISIT_TYPES.map(({ type, title, description, Icon }) => {
                const selected = type === sessionType;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseVisitType(type)}
                    className="group flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      borderColor: selected
                        ? 'var(--color-accent)'
                        : 'var(--color-border-soft)',
                      background: selected
                        ? 'var(--color-accent-soft)'
                        : 'var(--color-surface)',
                      boxShadow: selected ? 'var(--shadow-sm)' : undefined,
                    }}
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: selected
                          ? 'var(--color-accent)'
                          : 'var(--color-surface-2)',
                        color: selected
                          ? 'oklch(0.99 0 0)'
                          : 'var(--color-fg-muted)',
                      }}
                    >
                      <Icon size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-sm font-medium"
                        style={{
                          color: selected ? 'var(--color-accent-fg)' : 'var(--color-fg)',
                        }}
                      >
                        {title}
                      </span>
                      <span
                        className="mt-0.5 block text-xs"
                        style={{ color: 'var(--color-fg-subtle)' }}
                      >
                        {description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="border-t pt-4"
              style={{ borderColor: 'var(--color-border-soft)' }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={sessionType}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: duration.base, ease: ease.enter }}
                  className="space-y-3"
                >
                  <div className="flex items-baseline justify-between">
                    <h3
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-fg)' }}
                    >
                      Template
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCreatingTemplate(true)}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--color-accent-fg)' }}
                    >
                      <Plus size={11} strokeWidth={2} className="mr-0.5 inline" />
                      New custom template
                    </button>
                  </div>

                  {visitTemplates.length === 0 ? (
                    <div
                      className="rounded-lg border border-dashed p-3 text-xs"
                      style={{
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-fg-subtle)',
                      }}
                    >
                      No templates available for this visit type. Create one to
                      continue, or start without a template.
                    </div>
                  ) : visitTemplates.length === 1 || !showAllTemplates ? (
                    <CompactTemplate
                      template={
                        visitTemplates.find((t) => t.id === effectiveTemplateId) ??
                        visitTemplates[0]
                      }
                      hasMore={visitTemplates.length > 1}
                      onChange={() => setShowAllTemplates(true)}
                    />
                  ) : (
                    <ul className="space-y-1.5">
                      {visitTemplates.map((t) => {
                        const selected = t.id === effectiveTemplateId;
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => setTemplateId(t.id)}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                              style={{
                                borderColor: selected
                                  ? 'var(--color-accent)'
                                  : 'var(--color-border-soft)',
                                background: selected
                                  ? 'var(--color-accent-soft)'
                                  : undefined,
                              }}
                            >
                              <span className="flex min-w-0 flex-1 items-center gap-2">
                                <span
                                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                                  style={{
                                    borderColor: selected
                                      ? 'var(--color-accent)'
                                      : 'var(--color-border)',
                                    background: selected
                                      ? 'var(--color-accent)'
                                      : 'transparent',
                                    color: 'oklch(0.99 0 0)',
                                  }}
                                >
                                  {selected && <Check size={10} strokeWidth={3} />}
                                </span>
                                <span
                                  className="truncate font-medium"
                                  style={{
                                    color: selected
                                      ? 'var(--color-accent-fg)'
                                      : 'var(--color-fg)',
                                  }}
                                >
                                  {t.name}
                                </span>
                              </span>
                              <span
                                className="shrink-0 text-xs"
                                style={{ color: 'var(--color-fg-subtle)' }}
                              >
                                {t.builtin ? 'Built-in' : 'Custom'} ·{' '}
                                {t.sections.length} sections
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </motion.div>
              </AnimatePresence>
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

      <NewTemplateModal
        open={creatingTemplate}
        visitTypeLabel={
          VISIT_TYPES.find((v) => v.type === sessionType)?.title ?? ''
        }
        onClose={() => setCreatingTemplate(false)}
        onCreate={handleCreateTemplate}
      />
    </div>
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
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: 'var(--color-border-soft)',
        background: 'var(--color-surface-2)',
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--color-fg)' }}
          >
            {template.name}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-fg-subtle)',
            }}
          >
            {template.builtin ? 'Built-in' : 'Custom'}
          </span>
        </div>
        <div className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
          {template.sections.length} sections
        </div>
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={onChange}
          className="text-xs hover:underline"
          style={{ color: 'var(--color-accent-fg)' }}
        >
          Change
        </button>
      )}
    </div>
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
      <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
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
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setName('');
            onClose();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!name.trim()}
          onClick={() => {
            onCreate(name);
            setName('');
          }}
        >
          Create
        </button>
      </div>
    </Modal>
  );
}
