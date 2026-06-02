import { createListSliceContext } from './createListSliceContext';
import type { Exercise } from '@/types';

export interface ExercisesContextValue {
  exercises: Exercise[];
  addExercise: (exercise: Exercise) => void;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  removeExercise: (id: string) => void;
  getExercise: (id: string) => Exercise | undefined;
}

const { Provider, useSlice } = createListSliceContext<Exercise, ExercisesContextValue>({
  label: 'Exercises',
  select: (appData) => appData.exercises,
  selectUpdater: (app) => app.updateExercisesSlice,
  protectBuiltins: true,
  build: (m, exercises) => ({
    exercises,
    addExercise: m.add,
    updateExercise: m.update,
    removeExercise: m.remove,
    getExercise: m.get,
  }),
});

export const ExercisesProvider = Provider;
export const useExercises = useSlice;
