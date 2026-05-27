import { useCallback, useMemo, useState } from 'react';
import { Copy, Pencil, Trash2, Lock, Plus, Star, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useOrgConfig } from '@/contexts/OrgConfigProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { newId } from '@/utils/ids';
import { useToggle } from '@/hooks/useToggle';
import type { NoteFormat, NoteTemplate, NoteTemplateSection } from '@/types';

const FORMAT_LABEL: Record<NoteFormat, string> = {
  evaluation: 'Initial evaluation',
  soap: 'Follow-up (SOAP)',
  progress: 'Progress note',
  discharge: 'Discharge',
  custom: 'Other / legacy',
};

const FORMAT_ORDER: NoteFormat[] = ['evaluation', 'soap', 'progress', 'discharge', 'custom'];
const SELECTABLE_FORMATS: NoteFormat[] = ['evaluation', 'soap', 'progress', 'discharge'];

export function Templates() {
  const { templates, addTemplate, updateTemplate, cloneTemplate, removeTemplate } = useTemplates();
  const { sharedTemplates } = useOrgConfig();
  const { settings, updateOrgPolicy } = useSettings();
  const orgDefaultId = settings.orgPolicy.activeTemplateId;
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [creating, startCreating, stopCreating] = useToggle();

  // Org shared templates are read-only and live only in OrgConfig context (never
  // in AppData) — like built-ins, but sourced from the org. We merge them into
  // the list for display; cloning copies them into the user's own library.
  const orgTemplateIds = useMemo(
    () => new Set(sharedTemplates.map((t) => t.id)),
    [sharedTemplates],
  );

  const cloneFromOrg = useCallback(
    (src: NoteTemplate): NoteTemplate => {
      const now = Date.now();
      const clone: NoteTemplate = {
        ...src,
        id: newId(),
        name: `${src.name} (copy)`,
        builtin: false,
        createdAt: now,
        updatedAt: now,
      };
      addTemplate(clone);
      return clone;
    },
    [addTemplate],
  );

  const grouped = useMemo(() => {
    const buckets: Record<NoteFormat, NoteTemplate[]> = {
      evaluation: [],
      soap: [],
      progress: [],
      discharge: [],
      custom: [],
    };
    const localIds = new Set(templates.map((t) => t.id));
    const merged = [...templates, ...sharedTemplates.filter((t) => !localIds.has(t.id))];
    for (const t of merged) {
      buckets[t.format]?.push(t);
    }
    for (const fmt of FORMAT_ORDER) {
      // Built-ins first, then org shared, then user templates — each alpha within.
      buckets[fmt].sort((a, b) => {
        const rank = (t: NoteTemplate) => (t.builtin ? 0 : orgTemplateIds.has(t.id) ? 1 : 2);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
    }
    return buckets;
  }, [templates, sharedTemplates, orgTemplateIds]);

  function handleCreate(format: NoteFormat, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    const blank: NoteTemplate = {
      id: newId(),
      name: trimmed,
      format,
      sections: [{ key: 'body', label: 'Body', promptHint: '' }],
      systemPrompt:
        'You are a clinical scribe. Return a JSON object whose keys match the provided section keys; each value is the section text in plain prose.',
      builtin: false,
      createdAt: now,
      updatedAt: now,
    };
    addTemplate(blank);
    setEditing(blank);
    stopCreating();
  }

  return (
    <div
      style={{
        padding: 22,
        display: 'grid',
        gap: 14,
        alignContent: 'start',
        maxWidth: 980,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <Eyebrow>Templates</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
            One template per visit type. Built-in formats are read-only — clone one to customize.
          </p>
        </div>
        <PtButton
          variant="primary"
          iconLeft={<Plus size={14} strokeWidth={2} />}
          onClick={() => startCreating()}
        >
          New template
        </PtButton>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {FORMAT_ORDER.map((fmt) => {
          const items = grouped[fmt];
          if (items.length === 0) return null;
          return (
            <SurfaceCard key={fmt} padding={0}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  padding: '10px 18px',
                  borderBottom: '1px solid var(--color-pt-border)',
                  background: 'var(--color-pt-surface-mut)',
                }}
              >
                <Eyebrow>{FORMAT_LABEL[fmt]}</Eyebrow>
                <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
                  {items.length} {items.length === 1 ? 'template' : 'templates'}
                </span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((t, i) => {
                  const isOrg = orgTemplateIds.has(t.id);
                  return (
                  <li
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 18px',
                      fontSize: 13,
                      borderBottom:
                        i === items.length - 1 ? 'none' : '1px solid var(--color-pt-border)',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-pt-text)' }}>
                          {t.name}
                        </span>
                        {t.builtin && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 7px',
                              borderRadius: 999,
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              background: 'var(--color-pt-surface-mut)',
                              color: 'var(--color-pt-text-3)',
                              border: '1px solid var(--color-pt-border)',
                            }}
                          >
                            <Lock size={10} /> Built-in
                          </span>
                        )}
                        {isOrg && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 7px',
                              borderRadius: 999,
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              background: 'var(--color-pt-surface-mut)',
                              color: 'var(--color-pt-text-3)',
                              border: '1px solid var(--color-pt-border)',
                            }}
                          >
                            <Building2 size={10} /> Org
                          </span>
                        )}
                        {!t.builtin && !isOrg && orgDefaultId === t.id && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 7px',
                              borderRadius: 999,
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              background: 'var(--color-pt-accent-soft)',
                              color: 'var(--color-pt-accent-fg)',
                              border: '1px solid var(--color-pt-accent)',
                            }}
                          >
                            <Star size={10} fill="currentColor" strokeWidth={2} /> Org default
                          </span>
                        )}
                      </div>
                      <div
                        style={{ marginTop: 2, fontSize: 11.5, color: 'var(--color-pt-text-3)' }}
                      >
                        {t.sections.length} sections
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!t.builtin && !isOrg && (
                        <PtButton
                          variant="ghost"
                          style={{
                            padding: '6px 10px',
                            fontSize: 12,
                            color:
                              orgDefaultId === t.id
                                ? 'var(--color-pt-accent-fg)'
                                : 'var(--color-pt-text-3)',
                          }}
                          aria-label={
                            orgDefaultId === t.id
                              ? 'Clear org default template'
                              : 'Set as org default template'
                          }
                          aria-pressed={orgDefaultId === t.id}
                          title={
                            orgDefaultId === t.id
                              ? 'Org default — click to clear'
                              : 'Set as org default'
                          }
                          onClick={() => {
                            if (orgDefaultId === t.id) {
                              updateOrgPolicy({ activeTemplateId: undefined });
                              toast.success('Org default cleared');
                            } else {
                              updateOrgPolicy({ activeTemplateId: t.id });
                              toast.success(`"${t.name}" set as org default`);
                            }
                          }}
                        >
                          <Star
                            size={12}
                            strokeWidth={2}
                            fill={orgDefaultId === t.id ? 'currentColor' : 'none'}
                          />
                        </PtButton>
                      )}
                      <PtButton
                        variant="ghost"
                        iconLeft={<Copy size={12} strokeWidth={2} />}
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => {
                          const clone = isOrg ? cloneFromOrg(t) : cloneTemplate(t.id);
                          if (clone) {
                            toast.success('Template cloned');
                            setEditing(clone);
                          }
                        }}
                      >
                        Clone
                      </PtButton>
                      {!t.builtin && !isOrg && (
                        <>
                          <PtButton
                            variant="ghost"
                            iconLeft={<Pencil size={12} strokeWidth={2} />}
                            style={{ padding: '6px 10px', fontSize: 12 }}
                            onClick={() => setEditing(t)}
                          >
                            Edit
                          </PtButton>
                          <PtButton
                            variant="ghost"
                            style={{
                              padding: '6px 10px',
                              fontSize: 12,
                              color: 'var(--color-pt-red)',
                            }}
                            onClick={() => {
                              if (confirm(`Delete template "${t.name}"?`)) removeTemplate(t.id);
                            }}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                          </PtButton>
                        </>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </SurfaceCard>
          );
        })}
      </div>

      {creating && <CreateTemplateModal onClose={() => stopCreating()} onCreate={handleCreate} />}

      {editing && (
        <TemplateEditorModal
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateTemplate(editing.id, patch);
            setEditing(null);
            toast.success('Template saved');
          }}
        />
      )}
    </div>
  );
}

function CreateTemplateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (format: NoteFormat, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<NoteFormat>('soap');

  return (
    <Modal open onClose={onClose} title="New template" size="sm">
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-3)', margin: 0 }}>
        Templates are scoped to a visit type so the New Session picker can show only the relevant
        ones. You can refine sections and the AI prompt immediately after creating.
      </p>
      <Field label="Visit type" hint="Where this template will appear.">
        <Select value={format} onChange={(e) => setFormat(e.target.value as NoteFormat)}>
          {SELECTABLE_FORMATS.map((fmt) => (
            <option key={fmt} value={fmt}>
              {FORMAT_LABEL[fmt]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Template name">
        <TextInput
          autoFocus
          value={name}
          placeholder="e.g. ACL post-op SOAP"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onCreate(format, name);
          }}
        />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <PtButton variant="ghost" onClick={onClose}>
          Cancel
        </PtButton>
        <PtButton variant="primary" disabled={!name.trim()} onClick={() => onCreate(format, name)}>
          Create &amp; edit
        </PtButton>
      </div>
    </Modal>
  );
}

function TemplateEditorModal({
  template,
  onClose,
  onSave,
}: {
  template: NoteTemplate;
  onClose: () => void;
  onSave: (patch: Partial<NoteTemplate>) => void;
}) {
  const [name, setName] = useState(template.name);
  const [format, setFormat] = useState<NoteFormat>(template.format);
  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt);
  const [sections, setSections] = useState<NoteTemplateSection[]>(template.sections);

  const formatOptions: NoteFormat[] =
    template.format === 'custom' ? ['custom', ...SELECTABLE_FORMATS] : SELECTABLE_FORMATS;

  function update(idx: number, patch: Partial<NoteTemplateSection>) {
    setSections(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function add() {
    setSections([
      ...sections,
      { key: `section_${sections.length + 1}`, label: 'New section', promptHint: '' },
    ]);
  }
  function remove(idx: number) {
    setSections(sections.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...sections];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setSections(next);
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${template.name}`} size="lg">
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Visit type" hint="Where this template appears in New Session.">
          <Select value={format} onChange={(e) => setFormat(e.target.value as NoteFormat)}>
            {formatOptions.map((fmt) => (
              <option key={fmt} value={fmt}>
                {FORMAT_LABEL[fmt]}
              </option>
            ))}
          </Select>
        </Field>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Sections</Eyebrow>
            <PtButton
              variant="ghost"
              iconLeft={<Plus size={12} strokeWidth={2} />}
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={add}
            >
              Add section
            </PtButton>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {sections.map((s, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--color-pt-border)',
                  background: 'var(--color-pt-surface-mut)',
                  padding: 10,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr auto',
                    gap: 8,
                  }}
                >
                  <TextInput
                    placeholder="key"
                    value={s.key}
                    onChange={(e) =>
                      update(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })
                    }
                  />
                  <TextInput
                    placeholder="Label"
                    value={s.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <PtButton
                      variant="ghost"
                      style={{ padding: '4px 8px', fontSize: 10 }}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </PtButton>
                    <PtButton
                      variant="ghost"
                      style={{ padding: '4px 8px', fontSize: 10 }}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </PtButton>
                    <PtButton
                      variant="ghost"
                      style={{ padding: '4px 8px', fontSize: 10, color: 'var(--color-pt-red)' }}
                      onClick={() => remove(i)}
                    >
                      <Trash2 size={11} />
                    </PtButton>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <TextInput
                    placeholder="Prompt hint (optional — guides the AI for this section)"
                    value={s.promptHint ?? ''}
                    onChange={(e) => update(i, { promptHint: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field
          label="System prompt"
          hint="Tell the AI exactly what JSON to return. Section keys must match the keys above."
        >
          <textarea
            className="input"
            style={{ minHeight: 128, fontSize: 12, fontFamily: 'var(--font-mono)' }}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <PtButton variant="ghost" onClick={onClose}>
          Cancel
        </PtButton>
        <PtButton
          variant="primary"
          onClick={() => onSave({ name, format, sections, systemPrompt })}
        >
          Save template
        </PtButton>
      </div>
    </Modal>
  );
}
