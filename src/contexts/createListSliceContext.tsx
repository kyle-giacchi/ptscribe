import { createContext, useContext, useMemo, type ReactNode, type ReactElement } from 'react';
import { useAppData, type AppDataContextValue } from './AppDataProvider';
import { makeListMutators, type ListItem, type ListSliceMutators } from './listSlice';
import type { AppData } from '@/types';

type SliceSetter<T> = (next: T[] | ((prev: T[]) => T[])) => void;

export interface ListSliceConfig<T extends ListItem, V> {
  /** Used in the hook's "must be used within" guard, e.g. 'Sessions' → useSessions/SessionsProvider. */
  label: string;
  /** Read this slice's array out of AppData. */
  select: (appData: AppData) => T[];
  /** Pick the matching `updateXSlice` setter from AppDataProvider. */
  selectUpdater: (app: AppDataContextValue) => SliceSetter<T>;
  /** Templates/exercises opt into builtin protection (update/remove become no-ops for builtins). */
  protectBuiltins?: boolean;
  /** Build the domain-named context value from the generic mutators + current items. */
  build: (mutators: ListSliceMutators<T>, items: T[]) => V;
}

/**
 * Generate the context + provider + hook for a list-shaped slice, collapsing the
 * createContext / useAppData / makeListMutators / useMemo / null-guard ceremony
 * that was copy-pasted across the list providers. Each slice file is left with
 * only its genuinely-different domain methods (the `build` callback).
 *
 * Each slice keeps its OWN React context, so a consumer of one slice still does
 * not re-render when another slice changes (architecture.md §Why slice providers).
 *
 * Scope: pure list slices only. Clinician/Settings are single-object slices, and
 * Patients carries a cross-slice cascade delete (bulkUpdate over four slices +
 * audio shred) — those stay hand-written rather than widening this interface.
 */
export function createListSliceContext<T extends ListItem, V>(
  config: ListSliceConfig<T, V>,
): {
  Provider: (props: { children: ReactNode }) => ReactElement;
  useSlice: () => V;
} {
  const { label, select, selectUpdater, protectBuiltins, build } = config;
  const Context = createContext<V | null>(null);

  function Provider({ children }: { children: ReactNode }): ReactElement {
    const app = useAppData();
    const items = select(app.appData);
    const setItems = selectUpdater(app);
    const value = useMemo<V>(
      () => build(makeListMutators(items, setItems, { protectBuiltins }), items),
      [items, setItems, build, protectBuiltins],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useSlice(): V {
    const ctx = useContext(Context);
    if (!ctx) throw new Error(`use${label} must be used within ${label}Provider`);
    return ctx;
  }

  return { Provider, useSlice };
}
