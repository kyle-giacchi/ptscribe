import { describe, expect, it } from 'vitest';
import { makeListMutators, type ListItem } from './listSlice';

interface Item extends ListItem {
  name?: string;
}

/**
 * Build a tiny stateful harness that mimics the slice provider → `merge`
 * functional-updater write path: `setItems` accepts either a replacement array
 * or `(prev) => next` and applies it to a closure variable. This is exactly the
 * contract `updateXSlice`/`merge` honor in `AppDataProvider`.
 */
function harness(initial: Item[] = []) {
  let items = initial;
  const setItems = (next: Item[] | ((prev: Item[]) => Item[])) => {
    items = typeof next === 'function' ? next(items) : next;
  };
  return {
    get items() {
      return items;
    },
    setItems,
  };
}

describe('makeListMutators — functional-updater composition', () => {
  it('add-then-update on the same render snapshot keeps both writes', () => {
    const h = harness([]);
    // NOTE: mutators are built once over the *initial* (empty) snapshot — this is
    // the render-time closure that previously caused the double-write footgun.
    const m = makeListMutators<Item>(h.items, h.setItems);

    m.add({ id: 'a', updatedAt: 0 });
    m.update('a', { name: 'x' });

    expect(h.items).toHaveLength(1);
    expect(h.items[0].id).toBe('a');
    expect(h.items[0].name).toBe('x');
    expect(h.items[0].updatedAt).toBeGreaterThanOrEqual(0);
  });

  it('add-then-add both survive (no clobber of the first)', () => {
    const h = harness([]);
    const m = makeListMutators<Item>(h.items, h.setItems);

    m.add({ id: 'a', updatedAt: 0 });
    m.add({ id: 'b', updatedAt: 0 });

    expect(h.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('update stamps a fresh updatedAt', () => {
    const h = harness([{ id: 'a', updatedAt: 1 }]);
    const m = makeListMutators<Item>(h.items, h.setItems);

    const before = Date.now();
    m.update('a', { name: 'renamed' });

    expect(h.items[0].name).toBe('renamed');
    expect(h.items[0].updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('remove drops the matching item under the updater form', () => {
    const h = harness([
      { id: 'a', updatedAt: 0 },
      { id: 'b', updatedAt: 0 },
    ]);
    const m = makeListMutators<Item>(h.items, h.setItems);

    m.remove('a');

    expect(h.items.map((i) => i.id)).toEqual(['b']);
  });
});

describe('makeListMutators — builtin protection under updater form', () => {
  it('update is a no-op for a builtin item', () => {
    const h = harness([{ id: 'a', updatedAt: 5, builtin: true, name: 'original' }]);
    const m = makeListMutators<Item>(h.items, h.setItems, { protectBuiltins: true });

    m.update('a', { name: 'hacked' });

    expect(h.items[0].name).toBe('original');
    expect(h.items[0].updatedAt).toBe(5);
  });

  it('remove is a no-op for a builtin item', () => {
    const h = harness([{ id: 'a', updatedAt: 0, builtin: true }]);
    const m = makeListMutators<Item>(h.items, h.setItems, { protectBuiltins: true });

    m.remove('a');

    expect(h.items.map((i) => i.id)).toEqual(['a']);
  });

  it('still updates a non-builtin item when protection is on', () => {
    const h = harness([{ id: 'a', updatedAt: 0, builtin: false, name: 'old' }]);
    const m = makeListMutators<Item>(h.items, h.setItems, { protectBuiltins: true });

    m.update('a', { name: 'new' });

    expect(h.items[0].name).toBe('new');
  });
});
