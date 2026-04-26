import { useMemo, useState } from 'react';
import { Dumbbell, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { useExercises } from '@/contexts/ExercisesProvider';
import { newId } from '@/utils/ids';
import {
  BODY_REGIONS,
  CATEGORY_LABEL,
  EXERCISE_CATEGORIES,
  REGION_LABEL,
  type BodyRegion,
  type Exercise,
  type ExerciseCategory,
} from '@/types';

export function Exercises() {
  const { exercises, addExercise, updateExercise, removeExercise } = useExercises();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<'all' | BodyRegion>('all');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => (region === 'all' ? true : e.region === region))
      .filter((e) =>
        q ? `${e.name} ${e.instructions} ${e.cues ?? ''}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query, region]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Exercise library"
        subtitle="Reference catalog you can prescribe from a patient's plan of care."
        Icon={Dumbbell}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} strokeWidth={2} /> New exercise
          </button>
        }
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
            placeholder="Search by name, cue, or instruction"
            className="pl-8"
          />
        </div>
        <Select
          value={region}
          onChange={(e) => setRegion(e.target.value as 'all' | BodyRegion)}
          className="md:w-56"
        >
          <option value="all">All regions</option>
          {BODY_REGIONS.map((r) => (
            <option key={r} value={r}>
              {REGION_LABEL[r]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <article key={e.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-base" style={{ color: 'var(--color-fg)' }}>
                  {e.name}
                </h3>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                  {REGION_LABEL[e.region]} · {CATEGORY_LABEL[e.category]}
                </div>
              </div>
              {e.builtin ? (
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-fg-subtle)' }}
                >
                  <Lock size={10} /> Built-in
                </span>
              ) : (
                <div className="flex gap-1">
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(e)}>
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    style={{ color: 'var(--color-negative)' }}
                    onClick={() => {
                      if (confirm(`Delete "${e.name}"?`)) removeExercise(e.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--color-fg-muted)' }}>
              {e.instructions}
            </p>
            {e.cues && (
              <p className="text-xs italic" style={{ color: 'var(--color-fg-subtle)' }}>
                Cue: {e.cues}
              </p>
            )}
            {e.defaultDosage && (
              <p className="text-xs" style={{ color: 'var(--color-fg-muted)' }}>
                Default dosage: <span style={{ color: 'var(--color-fg)' }}>{e.defaultDosage}</span>
              </p>
            )}
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="card text-sm" style={{ color: 'var(--color-fg-muted)' }}>
            No exercises match.
          </p>
        )}
      </div>

      {(creating || editing) && (
        <ExerciseEditorModal
          exercise={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(payload) => {
            if (editing) {
              updateExercise(editing.id, payload);
              toast.success('Exercise saved');
            } else {
              const now = Date.now();
              addExercise({ ...payload, id: newId(), builtin: false, createdAt: now, updatedAt: now });
              toast.success('Exercise added');
            }
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

interface ExerciseDraft {
  name: string;
  region: BodyRegion;
  category: ExerciseCategory;
  instructions: string;
  cues: string;
  defaultDosage: string;
  videoUrl: string;
}

function draftFromExercise(exercise: Exercise | null): ExerciseDraft {
  return {
    name: exercise?.name ?? '',
    region: exercise?.region ?? 'shoulder',
    category: exercise?.category ?? 'strength',
    instructions: exercise?.instructions ?? '',
    cues: exercise?.cues ?? '',
    defaultDosage: exercise?.defaultDosage ?? '',
    videoUrl: exercise?.videoUrl ?? '',
  };
}

function ExerciseEditorModal({
  exercise,
  onClose,
  onSave,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  onSave: (payload: Omit<Exercise, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const [draft, setDraft] = useState<ExerciseDraft>(() => draftFromExercise(exercise));
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const canSave = draft.name.trim().length > 0 && draft.instructions.trim().length > 0;

  function handleSave() {
    onSave({
      name: draft.name.trim(),
      region: draft.region,
      category: draft.category,
      instructions: draft.instructions.trim(),
      cues: draft.cues.trim() || undefined,
      defaultDosage: draft.defaultDosage.trim() || undefined,
      videoUrl: draft.videoUrl.trim() || undefined,
    });
  }

  return (
    <Modal open onClose={onClose} title={exercise ? 'Edit exercise' : 'New exercise'} size="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <TextInput value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Region">
          <Select
            value={draft.region}
            onChange={(e) => set('region', e.target.value as BodyRegion)}
          >
            {BODY_REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select
            value={draft.category}
            onChange={(e) => set('category', e.target.value as ExerciseCategory)}
          >
            {EXERCISE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Default dosage" hint="e.g., 3 x 10, daily">
          <TextInput
            value={draft.defaultDosage}
            onChange={(e) => set('defaultDosage', e.target.value)}
          />
        </Field>
        <Field label="Video URL" hint="Optional reference link">
          <TextInput value={draft.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} />
        </Field>
        <Field label="Instructions" className="sm:col-span-2">
          <textarea
            className="input min-h-24"
            value={draft.instructions}
            onChange={(e) => set('instructions', e.target.value)}
          />
        </Field>
        <Field label="Cues" className="sm:col-span-2" hint="Short coaching cue you say to patients.">
          <TextInput value={draft.cues} onChange={(e) => set('cues', e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  );
}
