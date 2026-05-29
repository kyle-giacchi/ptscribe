import { useCallback, useMemo, useState } from 'react';
import { useToggle } from '@/hooks/useToggle';
import { Building2, Copy, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useExercises } from '@/contexts/ExercisesProvider';
import { useOrgConfig } from '@/contexts/OrgConfigProvider';
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
  const { sharedExercises } = useOrgConfig();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<'all' | BodyRegion>('all');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, startCreating, stopCreating] = useToggle();

  // Org shared exercises are read-only and live only in OrgConfig context (never
  // in AppData). We merge them in for display; cloning copies one into the
  // user's own library so it can be edited or prescribed.
  const orgExerciseIds = useMemo(
    () => new Set(sharedExercises.map((e) => e.id)),
    [sharedExercises],
  );

  const cloneFromOrg = useCallback(
    (src: Exercise) => {
      const now = Date.now();
      addExercise({
        ...src,
        id: newId(),
        name: `${src.name} (copy)`,
        builtin: false,
        createdAt: now,
        updatedAt: now,
      });
      toast.success('Exercise cloned');
    },
    [addExercise],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const localIds = new Set(exercises.map((e) => e.id));
    const merged = [...exercises, ...sharedExercises.filter((e) => !localIds.has(e.id))];
    return merged
      .filter((e) => (region === 'all' ? true : e.region === region))
      .filter((e) =>
        q ? `${e.name} ${e.instructions} ${e.cues ?? ''}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, sharedExercises, query, region]);

  return (
    <div style={{ padding: 22, display: 'grid', gap: 14, alignContent: 'start' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <Eyebrow>Exercise library</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
            Reference catalog you can prescribe from a patient's plan of care.
          </p>
        </div>
        <PtButton
          variant="primary"
          iconLeft={<Plus size={14} strokeWidth={2} />}
          onClick={startCreating}
        >
          New exercise
        </PtButton>
      </div>

      <SurfaceCard padding={14}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 480 }}>
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
              placeholder="Search by name, cue, or instruction"
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
          <div style={{ minWidth: 200 }}>
            <Select
              value={region}
              onChange={(e) => setRegion(e.target.value as 'all' | BodyRegion)}
            >
              <option value="all">All regions</option>
              {BODY_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', marginLeft: 'auto' }}>
            {filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}
          </span>
        </div>
      </SurfaceCard>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {filtered.map((e) => {
          const isOrg = orgExerciseIds.has(e.id);
          return (
            <SurfaceCard key={e.id} padding={14}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--color-pt-text)',
                        margin: 0,
                      }}
                    >
                      {e.name}
                    </h3>
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11.5,
                        color: 'var(--color-pt-text-3)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {REGION_LABEL[e.region]} · {CATEGORY_LABEL[e.category]}
                    </div>
                  </div>
                  {e.builtin ? (
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
                        flexShrink: 0,
                      }}
                    >
                      <Lock size={10} /> Built-in
                    </span>
                  ) : isOrg ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                      <PtButton
                        variant="ghost"
                        iconLeft={<Copy size={12} strokeWidth={2} />}
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => cloneFromOrg(e)}
                      >
                        Clone
                      </PtButton>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <PtButton
                        variant="ghost"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => setEditing(e)}
                      >
                        <Pencil size={12} />
                      </PtButton>
                      <PtButton
                        variant="ghost"
                        style={{ padding: '4px 8px', fontSize: 11, color: 'var(--color-pt-red)' }}
                        onClick={() => {
                          if (confirm(`Delete "${e.name}"?`)) removeExercise(e.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </PtButton>
                    </div>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--color-pt-text-2)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {e.instructions}
                </p>
                {e.cues && (
                  <p
                    style={{
                      fontSize: 11.5,
                      fontStyle: 'italic',
                      color: 'var(--color-pt-text-3)',
                      margin: 0,
                    }}
                  >
                    Cue: {e.cues}
                  </p>
                )}
                {e.defaultDosage && (
                  <p style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', margin: 0 }}>
                    Default dosage:{' '}
                    <span style={{ color: 'var(--color-pt-text)', fontWeight: 600 }}>
                      {e.defaultDosage}
                    </span>
                  </p>
                )}
              </div>
            </SurfaceCard>
          );
        })}
        {filtered.length === 0 && (
          <SurfaceCard padding={20}>
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-pt-text-3)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              No exercises match.
            </p>
          </SurfaceCard>
        )}
      </div>

      {(creating || editing) && (
        <ExerciseEditorModal
          exercise={editing}
          onClose={() => {
            setEditing(null);
            stopCreating();
          }}
          onSave={(payload) => {
            if (editing) {
              updateExercise(editing.id, payload);
              toast.success('Exercise saved');
            } else {
              const now = Date.now();
              addExercise({
                ...payload,
                id: newId(),
                builtin: false,
                createdAt: now,
                updatedAt: now,
              });
              toast.success('Exercise added');
            }
            setEditing(null);
            stopCreating();
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
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
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
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <Field label="Instructions">
          <textarea
            className="input"
            style={{ minHeight: 96, fontSize: 13 }}
            value={draft.instructions}
            onChange={(e) => set('instructions', e.target.value)}
          />
        </Field>
        <Field label="Cues" hint="Short coaching cue you say to patients.">
          <TextInput value={draft.cues} onChange={(e) => set('cues', e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <PtButton variant="ghost" onClick={onClose}>
          Cancel
        </PtButton>
        <PtButton variant="primary" disabled={!canSave} onClick={handleSave}>
          Save
        </PtButton>
      </div>
    </Modal>
  );
}
