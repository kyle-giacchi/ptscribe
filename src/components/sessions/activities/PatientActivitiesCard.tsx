import { useState } from 'react';
import { Plus, Trash2, ArrowUp } from 'lucide-react';
import { TextInput } from '@/components/ui/Field';
import { PtButton, SurfaceCard } from '@/components/design';
import { ExercisePicker } from './ExercisePicker';
import type { ActivityEntry, Exercise, NoteActivities } from '@/types';

type ListKey = 'performed' | 'home';

const LIST_LABEL: Record<ListKey, string> = {
  performed: 'Performed this visit',
  home: 'Home program',
};

export interface PatientActivitiesCardProps {
  /** Already resolved by the caller — either the note's value or the plan seed. */
  activities: NoteActivities;
  exercises: Exercise[];
  /** True when the note is finalized. Mirrors NoteSectionEditor's readOnly. */
  readOnly: boolean;
  /** Shows the "from plan of care" hint on the home list. */
  seededFromPlan: boolean;
  /** Enables "Update plan of care" — the home list has diverged from the plan. */
  canSyncPlan: boolean;
  onChange: (next: NoteActivities) => void;
  onSyncPlan: () => void;
}

/**
 * Per-visit exercise log, rendered below NotePanel in the Review tab's left
 * column. Both lists are always visible; only the picker is a disclosure.
 *
 * This component is pure render + local picker state. It never persists —
 * `onChange` hands the whole next NoteActivities to the caller, which owns the
 * ensureNote/updateNote write.
 */
export function PatientActivitiesCard({
  activities,
  exercises,
  readOnly,
  seededFromPlan,
  canSyncPlan,
  onChange,
  onSyncPlan,
}: PatientActivitiesCardProps) {
  const [openPicker, setOpenPicker] = useState<ListKey | null>(null);

  function addTo(list: ListKey, exercise: Exercise) {
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      exerciseId: exercise.id,
      dosage: exercise.defaultDosage ?? '',
      exerciseName: exercise.name,
    };
    onChange({ ...activities, [list]: [...activities[list], entry] });
    setOpenPicker(null);
  }

  function patchEntry(list: ListKey, id: string, patch: Partial<ActivityEntry>) {
    onChange({
      ...activities,
      [list]: activities[list].map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  }

  function removeFrom(list: ListKey, id: string) {
    onChange({ ...activities, [list]: activities[list].filter((e) => e.id !== id) });
  }

  /**
   * Append performed entries whose exerciseId is not already in home. Existing
   * home entries are left untouched so an edited home dosage is never clobbered.
   */
  function copyPerformedToHome() {
    const present = new Set(activities.home.map((e) => e.exerciseId));
    const additions = activities.performed
      .filter((e) => !present.has(e.exerciseId))
      .map((e) => ({ ...e, id: crypto.randomUUID() }));
    if (additions.length === 0) return;
    onChange({ ...activities, home: [...activities.home, ...additions] });
  }

  function renderList(list: ListKey) {
    const entries = activities[list];
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-pt-text-2)',
            }}
          >
            {LIST_LABEL[list]}
          </span>
          {list === 'home' && seededFromPlan && (
            <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>from plan of care</span>
          )}
          <span style={{ flex: 1 }} />
          {list === 'home' && !readOnly && activities.performed.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={copyPerformedToHome}
              style={{ fontSize: 11, padding: '2px 6px', gap: 3, color: 'var(--color-pt-text-3)' }}
            >
              <ArrowUp size={10} strokeWidth={2} /> Copy from performed
            </button>
          )}
        </div>

        <ul style={{ display: 'grid', gap: 5, margin: 0, padding: 0, listStyle: 'none' }}>
          {entries.length === 0 && (
            <li style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>Nothing logged yet.</li>
          )}
          {entries.map((e) => (
            <li key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--color-pt-text)' }}>
                {e.exerciseName}
              </span>
              {readOnly ? (
                <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
                  {e.notes ? `${e.dosage} — ${e.notes}` : e.dosage}
                </span>
              ) : (
                <>
                  <div style={{ width: 130 }}>
                    <TextInput
                      aria-label={`Dosage for ${e.exerciseName} in ${list}`}
                      placeholder="3x10, daily"
                      value={e.dosage}
                      onChange={(ev) => patchEntry(list, e.id, { dosage: ev.target.value })}
                    />
                  </div>
                  <div style={{ width: 130 }}>
                    <TextInput
                      aria-label={`Note for ${e.exerciseName} in ${list}`}
                      placeholder="note (optional)"
                      value={e.notes ?? ''}
                      onChange={(ev) => patchEntry(list, e.id, { notes: ev.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${e.exerciseName} from ${list}`}
                    onClick={() => removeFrom(list, e.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-pt-text-3)',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        {!readOnly &&
          (openPicker === list ? (
            <ExercisePicker
              exercises={exercises}
              onPick={(ex) => addTo(list, ex)}
              onClose={() => setOpenPicker(null)}
            />
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`Add exercise to ${list}`}
              onClick={() => setOpenPicker(list)}
              style={{
                marginTop: 6,
                fontSize: 12,
                padding: '3px 7px',
                gap: 4,
                color: 'var(--color-pt-accent-fg)',
              }}
            >
              <Plus size={11} strokeWidth={2.4} /> Add exercise
            </button>
          ))}
      </div>
    );
  }

  return (
    <SurfaceCard padding={16} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-pt-text)', margin: 0 }}>
          Patient activities
        </h2>
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <PtButton variant="accent-soft" disabled={!canSyncPlan} onClick={onSyncPlan}>
            Update plan of care
          </PtButton>
        )}
      </div>
      <div style={{ display: 'grid', gap: 18 }}>
        {renderList('performed')}
        {renderList('home')}
      </div>
    </SurfaceCard>
  );
}
