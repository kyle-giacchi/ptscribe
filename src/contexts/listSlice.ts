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
 * `add`/`update`/`remove` pass **functional updaters** to `setItems` so a
 * synchronous `add(x)` then `update(x.id, p)` (or a second `add`) composes
 * against the latest array rather than a stale render-time snapshot. The
 * `setItems` contract therefore accepts `(prev: T[]) => T[]`; every slice
 * provider routes it through `updateXSlice`/`merge`, which already supports the
 * functional form. See the `project_list_mutator_double_write` footgun.
 *
 * `get` deliberately still reads the render-time `items` snapshot — reads do
 * not compose-write, so a caller needing the just-written value must re-derive
 * it from the next render rather than `get`-ing immediately after `add`.
 *
 * Providers wrap this and add domain-specific extras (e.g. `forPatient`,
 * `cloneTemplate`, `finalizeNote`).
 */
export function makeListMutators<T extends ListItem>(
  items: T[],
  setItems: (next: T[] | ((prev: T[]) => T[])) => void,
  options?: { protectBuiltins?: boolean },
): ListSliceMutators<T> {
  const protectBuiltins = options?.protectBuiltins ?? false;
  return {
    add: (item) => setItems((prev) => [...prev, item]),
    update: (id, patch) =>
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== id) return it;
          if (protectBuiltins && it.builtin) return it;
          return { ...it, ...patch, updatedAt: Date.now() };
        }),
      ),
    remove: (id) =>
      setItems((prev) =>
        prev.filter((it) => it.id !== id || (protectBuiltins && it.builtin === true)),
      ),
    get: (id) => items.find((it) => it.id === id),
  };
}
