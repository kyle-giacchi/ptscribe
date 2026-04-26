import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import { makeListMutators } from './listSlice';
import type { Exercise } from '@/types';

export interface ExercisesContextValue {
  exercises: Exercise[];
  addExercise: (exercise: Exercise) => void;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  removeExercise: (id: string) => void;
  getExercise: (id: string) => Exercise | undefined;
}

const ExercisesContext = createContext<ExercisesContextValue | null>(null);

export function ExercisesProvider({ children }: { children: ReactNode }) {
  const { appData, updateExercisesSlice } = useAppData();
  const exercises = appData.exercises;
  const value = useMemo<ExercisesContextValue>(() => {
    const m = makeListMutators(exercises, updateExercisesSlice, { protectBuiltins: true });
    return {
      exercises,
      addExercise: m.add,
      updateExercise: m.update,
      removeExercise: m.remove,
      getExercise: m.get,
    };
  }, [exercises, updateExercisesSlice]);
  return <ExercisesContext.Provider value={value}>{children}</ExercisesContext.Provider>;
}

export function useExercises(): ExercisesContextValue {
  const ctx = useContext(ExercisesContext);
  if (!ctx) throw new Error('useExercises must be used within ExercisesProvider');
  return ctx;
}
