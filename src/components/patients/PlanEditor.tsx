import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { TextInput, Select } from '@/components/ui/Field';
import { PtButton } from '@/components/design';
import { newId } from '@/utils/ids';
import type { Exercise, PlanGoal, PlanOfCare, Prescription } from '@/types';

export function PlanEditor({
  plan,
  exercises,
  onChange,
}: {
  plan: PlanOfCare;
  exercises: Exercise[];
  onChange: (patch: Partial<PlanOfCare>) => void;
}) {
  const [goalText, setGoalText] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [dosage, setDosage] = useState('');

  function addGoal() {
    if (!goalText.trim()) return;
    const g: PlanGoal = { id: newId(), text: goalText.trim(), met: false };
    onChange({ goals: [...plan.goals, g] });
    setGoalText('');
  }
  function toggleGoal(gid: string) {
    onChange({
      goals: plan.goals.map((g) => (g.id === gid ? { ...g, met: !g.met } : g)),
    });
  }
  function removeGoal(gid: string) {
    onChange({ goals: plan.goals.filter((g) => g.id !== gid) });
  }
  function addPrescription() {
    if (!exerciseId) return;
    const p: Prescription = {
      id: newId(),
      exerciseId,
      dosage: dosage.trim() || '3 sets x 10 reps',
    };
    onChange({ prescriptions: [...plan.prescriptions, p] });
    setExerciseId('');
    setDosage('');
  }
  function removePrescription(pid: string) {
    onChange({ prescriptions: plan.prescriptions.filter((p) => p.id !== pid) });
  }

  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-pt-text-2)',
          }}
        >
          Goals
        </div>
        <ul style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {plan.goals.length === 0 && (
            <li style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>No goals yet.</li>
          )}
          {plan.goals.map((g) => (
            <li key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input
                type="checkbox"
                checked={g.met}
                onChange={() => toggleGoal(g.id)}
                style={{ marginTop: 4 }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: g.met ? 'var(--color-pt-text-3)' : 'var(--color-pt-text)',
                  textDecoration: g.met ? 'line-through' : 'none',
                }}
              >
                {g.text}
              </span>
              <button
                type="button"
                onClick={() => removeGoal(g.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-pt-text-3)',
                  cursor: 'pointer',
                }}
                aria-label="Remove goal"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <TextInput
            placeholder="e.g., Return to overhead lifting pain-free in 6 weeks"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addGoal();
              }
            }}
          />
          <PtButton
            variant="accent-soft"
            onClick={addGoal}
            iconLeft={<Plus size={12} strokeWidth={2.4} />}
          >
            Add
          </PtButton>
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-pt-text-2)',
          }}
        >
          Prescriptions
        </div>
        <ul style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {plan.prescriptions.length === 0 && (
            <li style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>
              No exercises prescribed.
            </li>
          )}
          {plan.prescriptions.map((p) => {
            const ex = exercises.find((e) => e.id === p.exerciseId);
            return (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: 'var(--color-pt-text)' }}>
                    {ex?.name ?? 'Unknown exercise'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{p.dosage}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePrescription(p.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-pt-text-3)',
                    cursor: 'pointer',
                  }}
                  aria-label="Remove prescription"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ul>
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gap: 8,
            gridTemplateColumns: '1.4fr 1fr auto',
          }}
        >
          <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
            <option value="">Select exercise…</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <TextInput
            placeholder="3 x 10, daily"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
          />
          <PtButton
            variant="accent-soft"
            onClick={addPrescription}
            iconLeft={<Plus size={12} strokeWidth={2.4} />}
          >
            Add
          </PtButton>
        </div>
      </div>
    </div>
  );
}
