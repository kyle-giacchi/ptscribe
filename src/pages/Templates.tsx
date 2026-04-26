import { useMemo, useState } from 'react';
import {
  ClipboardList,
  Copy,
  Pencil,
  Trash2,
  Lock,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { newId } from '@/utils/ids';
import type { NoteFormat, NoteTemplate, NoteTemplateSection } from '@/types';

export function Templates() {
  const { templates, addTemplate, updateTemplate, cloneTemplate, removeTemplate } = useTemplates();
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(
    () => [...templates].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name)),
    [templates],
  );

  function handleCreate() {
    const now = Date.now();
    const blank: NoteTemplate = {
      id: newId(),
      name: 'New template',
      format: 'custom',
      sections: [{ key: 'body', label: 'Body', promptHint: '' }],
      systemPrompt:
        'You are a clinical scribe. Return a JSON object whose keys match the provided section keys; each value is the section text in plain prose.',
      builtin: false,
      createdAt: now,
      updatedAt: now,
    };
    addTemplate(blank);
    setEditing(blank);
    setCreating(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Templates"
        subtitle="Built-in formats are read-only — clone one to customize."
        Icon={ClipboardList}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} strokeWidth={2} /> New template
          </button>
        }
      />

      <div className="card p-0">
        <ul className="divide-y" style={{ borderColor: 'var(--color-border-soft)' }}>
          {sorted.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: 'var(--color-fg)' }}>
                    {t.name}
                  </span>
                  {t.builtin && (
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-fg-subtle)' }}
                    >
                      <Lock size={10} /> Built-in
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                  {t.format.toUpperCase()} · {t.sections.length} sections
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => {
                    const clone = cloneTemplate(t.id);
                    if (clone) {
                      toast.success('Template cloned');
                      setEditing(clone);
                    }
                  }}
                >
                  <Copy size={12} strokeWidth={2} /> Clone
                </button>
                {!t.builtin && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      onClick={() => setEditing(t)}
                    >
                      <Pencil size={12} strokeWidth={2} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      style={{ color: 'var(--color-negative)' }}
                      onClick={() => {
                        if (confirm(`Delete template "${t.name}"?`)) removeTemplate(t.id);
                      }}
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create template" size="sm">
        <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
          Start a blank template. You can also clone a built-in one from the list to keep its
          structure and edit from there.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>
            Create blank
          </button>
        </div>
      </Modal>

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

  function update(idx: number, patch: Partial<NoteTemplateSection>) {
    setSections(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function add() {
    setSections([...sections, { key: `section_${sections.length + 1}`, label: 'New section', promptHint: '' }]);
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
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Format" hint="Used to pick a default template per visit type.">
          <Select value={format} onChange={(e) => setFormat(e.target.value as NoteFormat)}>
            <option value="soap">SOAP</option>
            <option value="evaluation">Initial Evaluation</option>
            <option value="progress">Progress</option>
            <option value="discharge">Discharge</option>
            <option value="custom">Custom</option>
          </Select>
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--color-fg-muted)' }}>
              Sections
            </span>
            <button type="button" className="btn btn-ghost text-xs" onClick={add}>
              <Plus size={12} strokeWidth={2} /> Add section
            </button>
          </div>
          <div className="space-y-2">
            {sections.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border p-2.5 text-xs"
                style={{ borderColor: 'var(--color-border-soft)', background: 'var(--color-surface-2)' }}
              >
                <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                  <TextInput
                    placeholder="key"
                    value={s.key}
                    onChange={(e) => update(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
                  />
                  <TextInput
                    placeholder="Label"
                    value={s.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" className="btn btn-ghost text-[10px]" onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn btn-ghost text-[10px]" onClick={() => move(i, 1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost text-[10px]"
                      style={{ color: 'var(--color-negative)' }}
                      onClick={() => remove(i)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <TextInput
                  placeholder="Prompt hint (optional — guides the AI for this section)"
                  className="mt-2"
                  value={s.promptHint ?? ''}
                  onChange={(e) => update(i, { promptHint: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        <Field
          label="System prompt"
          hint="Tell the AI exactly what JSON to return. Section keys must match the keys above."
        >
          <textarea
            className="input min-h-32 text-xs"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave({ name, format, sections, systemPrompt })}
        >
          Save template
        </button>
      </div>
    </Modal>
  );
}
