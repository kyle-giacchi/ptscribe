import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { AppDataProvider } from './AppDataProvider';
import { ExercisesProvider, useExercises } from './ExercisesProvider';
import { defaultAppData } from '@/schemas';
import type { Exercise } from '@/types';

type Api = ReturnType<typeof useExercises>;

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: 'Quad Set',
    region: 'knee',
    category: 'strength',
    instructions: 'Tighten the quadriceps muscle and hold.',
    builtin: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function Probe({ ref }: { ref: { current: Api | null } }) {
  const api = useExercises();
  useEffect(() => {
    ref.current = api;
  });
  return null;
}

async function renderAndWait() {
  const ref: { current: Api | null } = { current: null };
  render(
    <AppDataProvider>
      <ExercisesProvider>
        <Probe ref={ref} />
      </ExercisesProvider>
    </AppDataProvider>,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  return ref as { current: Api };
}

describe('ExercisesProvider', () => {
  it('initializes with the built-in exercises from defaultAppData', async () => {
    const ref = await renderAndWait();
    const builtinCount = defaultAppData().exercises.filter((e) => e.builtin).length;
    expect(ref.current.exercises.filter((e) => e.builtin).length).toBe(builtinCount);
  });

  it('addExercise: exercise appears in the list', async () => {
    const ref = await renderAndWait();
    const exercise = makeExercise();
    await act(async () => ref.current.addExercise(exercise));
    await waitFor(() =>
      expect(ref.current.exercises.find((e) => e.id === exercise.id)).toBeDefined(),
    );
    expect(ref.current.exercises.find((e) => e.id === exercise.id)?.name).toBe(exercise.name);
  });

  it('updateExercise: name update persists', async () => {
    const ref = await renderAndWait();
    const exercise = makeExercise();
    await act(async () => ref.current.addExercise(exercise));
    await waitFor(() =>
      expect(ref.current.exercises.find((e) => e.id === exercise.id)).toBeDefined(),
    );
    await act(async () =>
      ref.current.updateExercise(exercise.id, { name: 'Terminal Knee Extension' }),
    );
    await waitFor(() =>
      expect(ref.current.exercises.find((e) => e.id === exercise.id)?.name).toBe(
        'Terminal Knee Extension',
      ),
    );
  });

  it('removeExercise: exercise no longer in list', async () => {
    const ref = await renderAndWait();
    const exercise = makeExercise();
    await act(async () => ref.current.addExercise(exercise));
    await waitFor(() =>
      expect(ref.current.exercises.find((e) => e.id === exercise.id)).toBeDefined(),
    );
    await act(async () => ref.current.removeExercise(exercise.id));
    await waitFor(() =>
      expect(ref.current.exercises.find((e) => e.id === exercise.id)).toBeUndefined(),
    );
  });

  it('getExercise: returns exercise by id', async () => {
    const ref = await renderAndWait();
    const exercise = makeExercise();
    await act(async () => ref.current.addExercise(exercise));
    await waitFor(() =>
      expect(ref.current.exercises.find((e) => e.id === exercise.id)).toBeDefined(),
    );
    expect(ref.current.getExercise(exercise.id)?.id).toBe(exercise.id);
  });

  it('getExercise: returns undefined for unknown id', async () => {
    const ref = await renderAndWait();
    expect(ref.current.getExercise('unknown')).toBeUndefined();
  });

  it('updateExercise: is a no-op for builtin exercises', async () => {
    const ref = await renderAndWait();
    const builtin = ref.current.exercises.find((e) => e.builtin)!;
    const originalName = builtin.name;
    await act(async () => ref.current.updateExercise(builtin.id, { name: 'Should Not Change' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ref.current.exercises.find((e) => e.id === builtin.id)?.name).toBe(originalName);
  });

  it('removeExercise: is a no-op for builtin exercises', async () => {
    const ref = await renderAndWait();
    const builtin = ref.current.exercises.find((e) => e.builtin)!;
    const countBefore = ref.current.exercises.filter((e) => e.builtin).length;
    await act(async () => ref.current.removeExercise(builtin.id));
    await new Promise((r) => setTimeout(r, 50));
    expect(ref.current.exercises.filter((e) => e.builtin).length).toBe(countBefore);
  });
});
