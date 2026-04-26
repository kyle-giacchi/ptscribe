import type { ID } from '@/types';

/**
 * Common shape across list-shaped slices: every entity has an `id`, an
 * `updatedAt` timestamp, and may opt into builtin protection.
 */
export interface ListItem {
  id: ID;
  updatedAt: number;
  builtin?: boolean;
}

export interface ListSliceMutators<T extends ListItem> {
  add: (item: T) => void;
  update: (id: ID, patch: Partial<T>) => void;
  remove: (id: ID) => void;
  get: (id: ID) => T | undefined;
}

/**
 * Build the standard add/update/remove/get mutator quartet for a list slice.
 *
 * - `update` shallow-merges and stamps `updatedAt: Date.now()`.
 * - `remove` filters by id.
 * - When `protectBuiltins: true` (templates, exercises) `update` and `remove`
 *   are no-ops for items with `builtin: true`.
 *
 * Providers wrap this and add domain-specific extras (e.g. `forPatient`,
 * `cloneTemplate`, `finalizeNote`).
 */
export function makeListMutators<T extends ListItem>(
  items: T[],
  setItems: (next: T[]) => void,
  options?: { protectBuiltins?: boolean },
): ListSliceMutators<T> {
  const protectBuiltins = options?.protectBuiltins ?? false;
  return {
    add: (item) => setItems([...items, item]),
    update: (id, patch) =>
      setItems(
        items.map((it) => {
          if (it.id !== id) return it;
          if (protectBuiltins && it.builtin) return it;
          return { ...it, ...patch, updatedAt: Date.now() };
        }),
      ),
    remove: (id) =>
      setItems(items.filter((it) => it.id !== id || (protectBuiltins && it.builtin === true))),
    get: (id) => items.find((it) => it.id === id),
  };
}
