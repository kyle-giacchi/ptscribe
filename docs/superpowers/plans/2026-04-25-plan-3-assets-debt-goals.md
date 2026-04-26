# Plan 3 — Assets, Debt, Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the financial picture with Assets (cash/investments/retirement), Debts (credit cards/loans), and Goals (targets + allocated + monthly contribution), plus a Net Worth selector and Goal progress views.

**Architecture:** CRUD pages built on the same slice/provider/useEntityReducer pattern from Plan 1. Pure-function selectors under `src/lib/finance/networth.ts` and `src/lib/finance/goals.ts`. Pages render lists with add/edit dialogs and small summary cards on top.

**Tech Stack:** React 19, TypeScript 6, Tailwind 4, shadcn/ui (already wired in Plan 1), Zod 4 (already wired), Vitest 4, Playwright.

**Prerequisites:** Plans 1 and 2 must be merged. The slice providers (`AssetsProvider`, `DebtsProvider`, `GoalsProvider`) and types (`Asset`, `Debt`, `Goal`) already exist from Plan 1.

---

## File Structure

**Selectors / Engines (pure):**

- Create: `src/lib/finance/networth.ts` — sum of assets, sum of debts, net worth, by-owner breakdowns
- Create: `src/lib/finance/goals.ts` — goal progress %, monthly-needed-to-target, ETA estimate
- Create: `src/lib/finance/__tests__/networth.test.ts`
- Create: `src/lib/finance/__tests__/goals.test.ts`

**Selectors (consumers):**

- Create: `src/state/selectors/networthSelectors.ts`
- Create: `src/state/selectors/goalsSelectors.ts`

**Hooks:**

- Create: `src/hooks/useNetWorth.ts`
- Create: `src/hooks/useGoalProgress.ts`

**UI — Assets:**

- Create: `src/components/assets/AssetTypePill.tsx`
- Create: `src/components/assets/AssetRow.tsx`
- Create: `src/components/assets/AddAssetDialog.tsx`
- Create: `src/components/assets/AssetsTable.tsx`
- Create: `src/components/assets/NetWorthCard.tsx`
- Create: `src/pages/AssetsPage.tsx`

**UI — Debt:**

- Create: `src/components/debt/DebtTypePill.tsx`
- Create: `src/components/debt/DebtRow.tsx`
- Create: `src/components/debt/AddDebtDialog.tsx`
- Create: `src/components/debt/DebtTable.tsx`
- Create: `src/components/debt/DebtSummaryCard.tsx`
- Create: `src/pages/DebtPage.tsx`

**UI — Goals:**

- Create: `src/components/goals/GoalRow.tsx`
- Create: `src/components/goals/AddGoalDialog.tsx`
- Create: `src/components/goals/GoalsList.tsx`
- Create: `src/components/goals/GoalProgressBar.tsx`
- Create: `src/components/goals/GoalsSummaryCard.tsx`
- Create: `src/pages/GoalsPage.tsx`

**Routing:**

- Modify: `src/AppRoutes.tsx` — add `/assets`, `/debt`, `/goals`

**E2E:**

- Create: `e2e/assets-debt-goals.spec.ts`

---

## Task 1: Net Worth engine

**Files:**

- Create: `src/lib/finance/networth.ts`
- Test: `src/lib/finance/__tests__/networth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finance/__tests__/networth.test.ts
import { describe, it, expect } from 'vitest';
import {
  totalAssets,
  totalDebts,
  netWorth,
  assetsByOwner,
  debtsByOwner,
  netWorthByOwner,
} from '../networth';
import type { Asset, Debt } from '@/types';

const a = (over: Partial<Asset>): Asset => ({
  id: 'a',
  name: 'x',
  type: 'cash',
  balance: 0,
  ownerId: 'm1',
  ...over,
});
const d = (over: Partial<Debt>): Debt => ({
  id: 'd',
  name: 'x',
  type: 'credit_card',
  balance: 0,
  apr: 0,
  minPayment: 0,
  ownerId: 'm1',
  ...over,
});

describe('networth', () => {
  it('sums assets', () => {
    expect(totalAssets([a({ balance: 100 }), a({ id: 'a2', balance: 250 })])).toBe(350);
  });

  it('sums debts', () => {
    expect(totalDebts([d({ balance: 500 }), d({ id: 'd2', balance: 1500 })])).toBe(2000);
  });

  it('net worth = assets - debts', () => {
    expect(netWorth([a({ balance: 1000 })], [d({ balance: 300 })])).toBe(700);
  });

  it('net worth can be negative', () => {
    expect(netWorth([a({ balance: 100 })], [d({ balance: 500 })])).toBe(-400);
  });

  it('groups assets by owner', () => {
    const r = assetsByOwner([
      a({ ownerId: 'm1', balance: 100 }),
      a({ id: 'a2', ownerId: 'm2', balance: 200 }),
      a({ id: 'a3', ownerId: 'm1', balance: 50 }),
    ]);
    expect(r.m1).toBe(150);
    expect(r.m2).toBe(200);
  });

  it('groups debts by owner', () => {
    const r = debtsByOwner([
      d({ ownerId: 'm1', balance: 100 }),
      d({ id: 'd2', ownerId: 'm2', balance: 300 }),
    ]);
    expect(r.m1).toBe(100);
    expect(r.m2).toBe(300);
  });

  it('net worth by owner', () => {
    const r = netWorthByOwner(
      [a({ ownerId: 'm1', balance: 1000 }), a({ id: 'a2', ownerId: 'm2', balance: 500 })],
      [d({ ownerId: 'm1', balance: 200 })],
    );
    expect(r.m1).toBe(800);
    expect(r.m2).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- networth`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement engine**

```ts
// src/lib/finance/networth.ts
import type { Asset, Debt } from '@/types';

export function totalAssets(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + a.balance, 0);
}

export function totalDebts(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.balance, 0);
}

export function netWorth(assets: Asset[], debts: Debt[]): number {
  return totalAssets(assets) - totalDebts(debts);
}

export function assetsByOwner(assets: Asset[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of assets) out[a.ownerId] = (out[a.ownerId] ?? 0) + a.balance;
  return out;
}

export function debtsByOwner(debts: Debt[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of debts) out[d.ownerId] = (out[d.ownerId] ?? 0) + d.balance;
  return out;
}

export function netWorthByOwner(assets: Asset[], debts: Debt[]): Record<string, number> {
  const a = assetsByOwner(assets);
  const d = debtsByOwner(debts);
  const ids = new Set<string>([...Object.keys(a), ...Object.keys(d)]);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (a[id] ?? 0) - (d[id] ?? 0);
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- networth`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/networth.ts src/lib/finance/__tests__/networth.test.ts
git commit -m "feat(finance): net worth engine"
```

---

## Task 2: Goals engine

**Files:**

- Create: `src/lib/finance/goals.ts`
- Test: `src/lib/finance/__tests__/goals.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finance/__tests__/goals.test.ts
import { describe, it, expect } from 'vitest';
import {
  goalProgressPct,
  remainingToTarget,
  monthsToTarget,
  monthlyNeededToHitTarget,
} from '../goals';
import type { Goal } from '@/types';

const g = (over: Partial<Goal>): Goal => ({
  id: 'g',
  name: 'x',
  target: 0,
  allocated: 0,
  monthlyContribution: 0,
  ...over,
});

describe('goals engine', () => {
  it('progress as ratio 0..1', () => {
    expect(goalProgressPct(g({ target: 1000, allocated: 250 }))).toBeCloseTo(0.25);
  });

  it('progress capped at 1', () => {
    expect(goalProgressPct(g({ target: 100, allocated: 500 }))).toBe(1);
  });

  it('progress 0 when target is 0', () => {
    expect(goalProgressPct(g({ target: 0, allocated: 100 }))).toBe(0);
  });

  it('remaining = target - allocated, never negative', () => {
    expect(remainingToTarget(g({ target: 1000, allocated: 300 }))).toBe(700);
    expect(remainingToTarget(g({ target: 100, allocated: 500 }))).toBe(0);
  });

  it('months to target with monthly contribution', () => {
    expect(monthsToTarget(g({ target: 1200, allocated: 0, monthlyContribution: 100 }))).toBe(12);
  });

  it('months to target = 0 when already met', () => {
    expect(monthsToTarget(g({ target: 100, allocated: 100, monthlyContribution: 50 }))).toBe(0);
  });

  it('months to target = Infinity when contribution is 0 and remaining > 0', () => {
    expect(monthsToTarget(g({ target: 1000, allocated: 0, monthlyContribution: 0 }))).toBe(
      Infinity,
    );
  });

  it('monthly needed to hit target by N months', () => {
    expect(monthlyNeededToHitTarget(g({ target: 1200, allocated: 200 }), 10)).toBe(100);
  });

  it('monthly needed = 0 when goal already met', () => {
    expect(monthlyNeededToHitTarget(g({ target: 100, allocated: 200 }), 5)).toBe(0);
  });

  it('monthly needed = Infinity when months <= 0', () => {
    expect(monthlyNeededToHitTarget(g({ target: 1000, allocated: 0 }), 0)).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- goals`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement engine**

```ts
// src/lib/finance/goals.ts
import type { Goal } from '@/types';

export function goalProgressPct(goal: Goal): number {
  if (goal.target <= 0) return 0;
  return Math.min(1, goal.allocated / goal.target);
}

export function remainingToTarget(goal: Goal): number {
  return Math.max(0, goal.target - goal.allocated);
}

export function monthsToTarget(goal: Goal): number {
  const remaining = remainingToTarget(goal);
  if (remaining <= 0) return 0;
  if (goal.monthlyContribution <= 0) return Infinity;
  return Math.ceil(remaining / goal.monthlyContribution);
}

export function monthlyNeededToHitTarget(goal: Goal, months: number): number {
  const remaining = remainingToTarget(goal);
  if (remaining <= 0) return 0;
  if (months <= 0) return Infinity;
  return remaining / months;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- goals`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/goals.ts src/lib/finance/__tests__/goals.test.ts
git commit -m "feat(finance): goals progress engine"
```

---

## Task 3: Selectors and hooks

**Files:**

- Create: `src/state/selectors/networthSelectors.ts`
- Create: `src/state/selectors/goalsSelectors.ts`
- Create: `src/hooks/useNetWorth.ts`
- Create: `src/hooks/useGoalProgress.ts`

- [ ] **Step 1: Write selectors**

```ts
// src/state/selectors/networthSelectors.ts
import type { Asset, Debt } from '@/types';
import { netWorth, totalAssets, totalDebts, netWorthByOwner } from '@/lib/finance/networth';

export const selectTotalAssets = (assets: Asset[]) => totalAssets(assets);
export const selectTotalDebts = (debts: Debt[]) => totalDebts(debts);
export const selectNetWorth = (assets: Asset[], debts: Debt[]) => netWorth(assets, debts);
export const selectNetWorthByOwner = (assets: Asset[], debts: Debt[]) =>
  netWorthByOwner(assets, debts);
```

```ts
// src/state/selectors/goalsSelectors.ts
import type { Goal } from '@/types';
import { goalProgressPct, remainingToTarget, monthsToTarget } from '@/lib/finance/goals';

export const selectGoalProgress = (goal: Goal) => goalProgressPct(goal);
export const selectRemaining = (goal: Goal) => remainingToTarget(goal);
export const selectMonthsToTarget = (goal: Goal) => monthsToTarget(goal);

export const selectTotalGoalAllocated = (goals: Goal[]) =>
  goals.reduce((s, g) => s + g.allocated, 0);
export const selectTotalGoalTarget = (goals: Goal[]) => goals.reduce((s, g) => s + g.target, 0);
```

- [ ] **Step 2: Write hooks**

```ts
// src/hooks/useNetWorth.ts
import { useMemo } from 'react';
import { useAssets } from '@/state/AssetsProvider';
import { useDebts } from '@/state/DebtsProvider';
import {
  selectNetWorth,
  selectTotalAssets,
  selectTotalDebts,
  selectNetWorthByOwner,
} from '@/state/selectors/networthSelectors';

export function useNetWorth() {
  const { assets } = useAssets();
  const { debts } = useDebts();
  return useMemo(
    () => ({
      totalAssets: selectTotalAssets(assets),
      totalDebts: selectTotalDebts(debts),
      netWorth: selectNetWorth(assets, debts),
      byOwner: selectNetWorthByOwner(assets, debts),
    }),
    [assets, debts],
  );
}
```

```ts
// src/hooks/useGoalProgress.ts
import { useMemo } from 'react';
import type { Goal } from '@/types';
import {
  selectGoalProgress,
  selectRemaining,
  selectMonthsToTarget,
} from '@/state/selectors/goalsSelectors';

export function useGoalProgress(goal: Goal) {
  return useMemo(
    () => ({
      progress: selectGoalProgress(goal),
      remaining: selectRemaining(goal),
      monthsToTarget: selectMonthsToTarget(goal),
    }),
    [goal],
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/state/selectors/networthSelectors.ts src/state/selectors/goalsSelectors.ts src/hooks/useNetWorth.ts src/hooks/useGoalProgress.ts
git commit -m "feat(state): networth and goals selectors/hooks"
```

---

## Task 4: Asset list components (table + row + type pill)

**Files:**

- Create: `src/components/assets/AssetTypePill.tsx`
- Create: `src/components/assets/AssetRow.tsx`
- Create: `src/components/assets/AssetsTable.tsx`

- [ ] **Step 1: Write `AssetTypePill`**

```tsx
// src/components/assets/AssetTypePill.tsx
import type { Asset } from '@/types';

const LABEL: Record<Asset['type'], string> = {
  cash: 'Cash',
  crypto: 'Crypto',
  investment: 'Investment',
  retirement: 'Retirement',
  hsa: 'HSA',
};

const COLOR: Record<Asset['type'], string> = {
  cash: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  crypto: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  investment: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  retirement: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  hsa: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

export function AssetTypePill({ type }: { type: Asset['type'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLOR[type]}`}
    >
      {LABEL[type]}
    </span>
  );
}
```

- [ ] **Step 2: Write `AssetRow`**

```tsx
// src/components/assets/AssetRow.tsx
import type { Asset, Member } from '@/types';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { AssetTypePill } from './AssetTypePill';

interface Props {
  asset: Asset;
  members: Member[];
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}

export function AssetRow({ asset, members, onEdit, onDelete }: Props) {
  const owner = members.find((m) => m.id === asset.ownerId);
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2">
        <AssetTypePill type={asset.type} />
      </td>
      <td className="px-3 py-2">{asset.name}</td>
      <td className="text-muted-foreground px-3 py-2">{owner?.name ?? '—'}</td>
      <td className="px-3 py-2 text-right font-mono">{formatMoney(asset.balance)}</td>
      <td className="px-3 py-2 text-right">
        <Button size="icon" variant="ghost" onClick={() => onEdit(asset)} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onDelete(asset.id)} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Write `AssetsTable`**

```tsx
// src/components/assets/AssetsTable.tsx
import type { Asset, Member } from '@/types';
import { AssetRow } from './AssetRow';

interface Props {
  assets: Asset[];
  members: Member[];
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}

export function AssetsTable({ assets, members, onEdit, onDelete }: Props) {
  if (assets.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No assets yet. Add your first one.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr className="text-left">
          <th className="px-3 py-2 font-medium">Type</th>
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Owner</th>
          <th className="px-3 py-2 text-right font-medium">Balance</th>
          <th className="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a) => (
          <AssetRow key={a.id} asset={a} members={members} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/assets/AssetTypePill.tsx src/components/assets/AssetRow.tsx src/components/assets/AssetsTable.tsx
git commit -m "feat(assets): list components"
```

---

## Task 5: Add/Edit Asset dialog

**Files:**

- Create: `src/components/assets/AddAssetDialog.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/components/assets/AddAssetDialog.tsx
import { useState, useEffect } from 'react';
import type { Asset, Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TYPES: Asset['type'][] = ['cash', 'crypto', 'investment', 'retirement', 'hsa'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: Member[];
  initial?: Asset;
  onSave: (a: Omit<Asset, 'id'> | Asset) => void;
}

export function AddAssetDialog({ open, onOpenChange, members, initial, onSave }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Asset['type']>('cash');
  const [balance, setBalance] = useState(0);
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? '');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'cash');
      setBalance(initial?.balance ?? 0);
      setOwnerId(initial?.ownerId ?? members[0]?.id ?? '');
    }
  }, [open, initial, members]);

  const handleSave = () => {
    if (!name.trim() || !ownerId) return;
    if (initial) onSave({ ...initial, name: name.trim(), type, balance, ownerId });
    else onSave({ name: name.trim(), type, balance, ownerId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit asset' : 'Add asset'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Checking"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as Asset['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Balance</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !ownerId}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/assets/AddAssetDialog.tsx
git commit -m "feat(assets): add/edit dialog"
```

---

## Task 6: NetWorthCard + AssetsPage

**Files:**

- Create: `src/components/assets/NetWorthCard.tsx`
- Create: `src/pages/AssetsPage.tsx`
- Modify: `src/AppRoutes.tsx`

- [ ] **Step 1: Write `NetWorthCard`**

```tsx
// src/components/assets/NetWorthCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNetWorth } from '@/hooks/useNetWorth';
import { formatMoney } from '@/lib/format';

export function NetWorthCard() {
  const { totalAssets, totalDebts, netWorth } = useNetWorth();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{formatMoney(netWorth)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Assets</div>
            <div className="font-mono">{formatMoney(totalAssets)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Debts</div>
            <div className="font-mono text-rose-600 dark:text-rose-400">
              {formatMoney(totalDebts)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `AssetsPage`**

```tsx
// src/pages/AssetsPage.tsx
import { useState } from 'react';
import type { Asset } from '@/types';
import { useAssets } from '@/state/AssetsProvider';
import { useHousehold } from '@/state/HouseholdProvider';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AssetsTable } from '@/components/assets/AssetsTable';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog';
import { NetWorthCard } from '@/components/assets/NetWorthCard';

export function AssetsPage() {
  const { assets, addAsset, updateAsset, removeAsset } = useAssets();
  const { household } = useHousehold();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | undefined>(undefined);

  const onAdd = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const onEdit = (a: Asset) => {
    setEditing(a);
    setDialogOpen(true);
  };
  const onSave = (a: Omit<Asset, 'id'> | Asset) => {
    if ('id' in a) updateAsset(a);
    else addAsset(a);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <Button onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add asset
        </Button>
      </div>
      <NetWorthCard />
      <div className="rounded-lg border">
        <AssetsTable
          assets={assets}
          members={household.members}
          onEdit={onEdit}
          onDelete={removeAsset}
        />
      </div>
      <AddAssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        members={household.members}
        initial={editing}
        onSave={onSave}
      />
    </div>
  );
}
```

- [ ] **Step 3: Wire route**

Edit `src/AppRoutes.tsx` — add an import and route entry:

```tsx
import { AssetsPage } from '@/pages/AssetsPage';
// ...
<Route path="/assets" element={<AssetsPage />} />;
```

- [ ] **Step 4: Smoke test in browser**

Run: `npm run dev`
Open: `http://localhost:8080/assets`
Expected: page renders, "Add asset" works, edit/delete works, NetWorthCard updates.

- [ ] **Step 5: Commit**

```bash
git add src/components/assets/NetWorthCard.tsx src/pages/AssetsPage.tsx src/AppRoutes.tsx
git commit -m "feat(assets): page with net worth card"
```

---

## Task 7: Debt list components

**Files:**

- Create: `src/components/debt/DebtTypePill.tsx`
- Create: `src/components/debt/DebtRow.tsx`
- Create: `src/components/debt/DebtTable.tsx`

- [ ] **Step 1: Write `DebtTypePill`**

```tsx
// src/components/debt/DebtTypePill.tsx
import type { Debt } from '@/types';

const LABEL: Record<Debt['type'], string> = {
  credit_card: 'Credit Card',
  loan: 'Loan',
  asset_loan: 'Asset Loan',
};

const COLOR: Record<Debt['type'], string> = {
  credit_card: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  loan: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  asset_loan: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

export function DebtTypePill({ type }: { type: Debt['type'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLOR[type]}`}
    >
      {LABEL[type]}
    </span>
  );
}
```

- [ ] **Step 2: Write `DebtRow`**

```tsx
// src/components/debt/DebtRow.tsx
import type { Debt, Member } from '@/types';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { formatMoney, formatPct } from '@/lib/format';
import { DebtTypePill } from './DebtTypePill';

interface Props {
  debt: Debt;
  members: Member[];
  onEdit: (d: Debt) => void;
  onDelete: (id: string) => void;
}

export function DebtRow({ debt, members, onEdit, onDelete }: Props) {
  const owner = members.find((m) => m.id === debt.ownerId);
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2">
        <DebtTypePill type={debt.type} />
      </td>
      <td className="px-3 py-2">{debt.name}</td>
      <td className="text-muted-foreground px-3 py-2">{owner?.name ?? '—'}</td>
      <td className="px-3 py-2 text-right font-mono">{formatMoney(debt.balance)}</td>
      <td className="px-3 py-2 text-right font-mono">{formatPct(debt.apr / 100)}</td>
      <td className="px-3 py-2 text-right font-mono">{formatMoney(debt.minPayment)}/mo</td>
      <td className="px-3 py-2 text-right">
        <Button size="icon" variant="ghost" onClick={() => onEdit(debt)} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onDelete(debt.id)} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Write `DebtTable`**

```tsx
// src/components/debt/DebtTable.tsx
import type { Debt, Member } from '@/types';
import { DebtRow } from './DebtRow';

interface Props {
  debts: Debt[];
  members: Member[];
  onEdit: (d: Debt) => void;
  onDelete: (id: string) => void;
}

export function DebtTable({ debts, members, onEdit, onDelete }: Props) {
  if (debts.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No debts. Nice.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr className="text-left">
          <th className="px-3 py-2 font-medium">Type</th>
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Owner</th>
          <th className="px-3 py-2 text-right font-medium">Balance</th>
          <th className="px-3 py-2 text-right font-medium">APR</th>
          <th className="px-3 py-2 text-right font-medium">Min</th>
          <th className="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {debts.map((d) => (
          <DebtRow key={d.id} debt={d} members={members} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/debt/DebtTypePill.tsx src/components/debt/DebtRow.tsx src/components/debt/DebtTable.tsx
git commit -m "feat(debt): list components"
```

---

## Task 8: Add/Edit Debt dialog + DebtSummaryCard + DebtPage

**Files:**

- Create: `src/components/debt/AddDebtDialog.tsx`
- Create: `src/components/debt/DebtSummaryCard.tsx`
- Create: `src/pages/DebtPage.tsx`
- Modify: `src/AppRoutes.tsx`

- [ ] **Step 1: Write `AddDebtDialog`**

```tsx
// src/components/debt/AddDebtDialog.tsx
import { useState, useEffect } from 'react';
import type { Debt, Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TYPES: Debt['type'][] = ['credit_card', 'loan', 'asset_loan'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: Member[];
  initial?: Debt;
  onSave: (d: Omit<Debt, 'id'> | Debt) => void;
}

export function AddDebtDialog({ open, onOpenChange, members, initial, onSave }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Debt['type']>('credit_card');
  const [balance, setBalance] = useState(0);
  const [apr, setApr] = useState(0);
  const [minPayment, setMinPayment] = useState(0);
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? '');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'credit_card');
      setBalance(initial?.balance ?? 0);
      setApr(initial?.apr ?? 0);
      setMinPayment(initial?.minPayment ?? 0);
      setOwnerId(initial?.ownerId ?? members[0]?.id ?? '');
    }
  }, [open, initial, members]);

  const handleSave = () => {
    if (!name.trim() || !ownerId) return;
    const data = { name: name.trim(), type, balance, apr, minPayment, ownerId };
    if (initial) onSave({ ...initial, ...data });
    else onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit debt' : 'Add debt'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Sapphire"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as Debt['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Balance</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>APR (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={apr}
                onChange={(e) => setApr(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div>
            <Label>Minimum monthly payment</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={minPayment}
              onChange={(e) => setMinPayment(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !ownerId}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `DebtSummaryCard`**

```tsx
// src/components/debt/DebtSummaryCard.tsx
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebts } from '@/state/DebtsProvider';
import { formatMoney } from '@/lib/format';

export function DebtSummaryCard() {
  const { debts } = useDebts();
  const summary = useMemo(() => {
    const total = debts.reduce((s, d) => s + d.balance, 0);
    const monthlyMin = debts.reduce((s, d) => s + d.minPayment, 0);
    const weighted = total > 0 ? debts.reduce((s, d) => s + d.apr * d.balance, 0) / total : 0;
    return { total, monthlyMin, weighted };
  }, [debts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Debt</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-rose-600 tabular-nums dark:text-rose-400">
          {formatMoney(summary.total)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Monthly minimums</div>
            <div className="font-mono">{formatMoney(summary.monthlyMin)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Weighted APR</div>
            <div className="font-mono">{summary.weighted.toFixed(2)}%</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `DebtPage`**

```tsx
// src/pages/DebtPage.tsx
import { useState } from 'react';
import type { Debt } from '@/types';
import { useDebts } from '@/state/DebtsProvider';
import { useHousehold } from '@/state/HouseholdProvider';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DebtTable } from '@/components/debt/DebtTable';
import { AddDebtDialog } from '@/components/debt/AddDebtDialog';
import { DebtSummaryCard } from '@/components/debt/DebtSummaryCard';

export function DebtPage() {
  const { debts, addDebt, updateDebt, removeDebt } = useDebts();
  const { household } = useHousehold();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | undefined>(undefined);

  const onAdd = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const onEdit = (d: Debt) => {
    setEditing(d);
    setDialogOpen(true);
  };
  const onSave = (d: Omit<Debt, 'id'> | Debt) => {
    if ('id' in d) updateDebt(d);
    else addDebt(d);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Debt</h1>
        <Button onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add debt
        </Button>
      </div>
      <DebtSummaryCard />
      <div className="rounded-lg border">
        <DebtTable
          debts={debts}
          members={household.members}
          onEdit={onEdit}
          onDelete={removeDebt}
        />
      </div>
      <AddDebtDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        members={household.members}
        initial={editing}
        onSave={onSave}
      />
    </div>
  );
}
```

- [ ] **Step 4: Wire route**

Edit `src/AppRoutes.tsx`:

```tsx
import { DebtPage } from '@/pages/DebtPage';
// ...
<Route path="/debt" element={<DebtPage />} />;
```

- [ ] **Step 5: Smoke test in browser**

Run: `npm run dev`
Open: `http://localhost:8080/debt`
Expected: page renders, add/edit/delete work, summary card updates.

- [ ] **Step 6: Commit**

```bash
git add src/components/debt/AddDebtDialog.tsx src/components/debt/DebtSummaryCard.tsx src/pages/DebtPage.tsx src/AppRoutes.tsx
git commit -m "feat(debt): page with summary card"
```

---

## Task 9: Goals — list components

**Files:**

- Create: `src/components/goals/GoalProgressBar.tsx`
- Create: `src/components/goals/GoalRow.tsx`
- Create: `src/components/goals/GoalsList.tsx`

- [ ] **Step 1: Write `GoalProgressBar`**

```tsx
// src/components/goals/GoalProgressBar.tsx
interface Props {
  pct: number; // 0..1
}

export function GoalProgressBar({ pct }: Props) {
  const clamped = Math.max(0, Math.min(1, pct));
  const widthPct = `${(clamped * 100).toFixed(1)}%`;
  return (
    <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
      <div className="h-full bg-emerald-500" style={{ width: widthPct }} />
    </div>
  );
}
```

- [ ] **Step 2: Write `GoalRow`**

```tsx
// src/components/goals/GoalRow.tsx
import type { Goal } from '@/types';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { GoalProgressBar } from './GoalProgressBar';
import { useGoalProgress } from '@/hooks/useGoalProgress';

interface Props {
  goal: Goal;
  onEdit: (g: Goal) => void;
  onDelete: (id: string) => void;
}

export function GoalRow({ goal, onEdit, onDelete }: Props) {
  const { progress, remaining, monthsToTarget } = useGoalProgress(goal);
  const monthsLabel = monthsToTarget === Infinity ? '—' : `${monthsToTarget} mo`;

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{goal.name}</div>
          {goal.targetDate && (
            <div className="text-muted-foreground text-xs">Target: {goal.targetDate}</div>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(goal)} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(goal.id)} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <GoalProgressBar pct={progress} />
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Saved</div>
          <div className="font-mono">{formatMoney(goal.allocated)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Target</div>
          <div className="font-mono">{formatMoney(goal.target)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Remaining</div>
          <div className="font-mono">{formatMoney(remaining)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">
            ETA at {formatMoney(goal.monthlyContribution)}/mo
          </div>
          <div className="font-mono">{monthsLabel}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `GoalsList`**

```tsx
// src/components/goals/GoalsList.tsx
import type { Goal } from '@/types';
import { GoalRow } from './GoalRow';

interface Props {
  goals: Goal[];
  onEdit: (g: Goal) => void;
  onDelete: (id: string) => void;
}

export function GoalsList({ goals, onEdit, onDelete }: Props) {
  if (goals.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No goals yet. Add one to start tracking.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {goals.map((g) => (
        <GoalRow key={g.id} goal={g} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/goals/GoalProgressBar.tsx src/components/goals/GoalRow.tsx src/components/goals/GoalsList.tsx
git commit -m "feat(goals): list components"
```

---

## Task 10: Add/Edit Goal dialog + GoalsSummaryCard + GoalsPage

**Files:**

- Create: `src/components/goals/AddGoalDialog.tsx`
- Create: `src/components/goals/GoalsSummaryCard.tsx`
- Create: `src/pages/GoalsPage.tsx`
- Modify: `src/AppRoutes.tsx`

- [ ] **Step 1: Write `AddGoalDialog`**

```tsx
// src/components/goals/AddGoalDialog.tsx
import { useState, useEffect } from 'react';
import type { Goal } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Goal;
  onSave: (g: Omit<Goal, 'id'> | Goal) => void;
}

export function AddGoalDialog({ open, onOpenChange, initial, onSave }: Props) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState(0);
  const [allocated, setAllocated] = useState(0);
  const [monthlyContribution, setMonthly] = useState(0);
  const [targetDate, setTargetDate] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setTarget(initial?.target ?? 0);
      setAllocated(initial?.allocated ?? 0);
      setMonthly(initial?.monthlyContribution ?? 0);
      setTargetDate(initial?.targetDate ?? '');
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!name.trim()) return;
    const data: Omit<Goal, 'id'> = {
      name: name.trim(),
      target,
      allocated,
      monthlyContribution,
      targetDate: targetDate || undefined,
    };
    if (initial) onSave({ ...initial, ...data });
    else onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit goal' : 'Add goal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency Fund"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Already saved</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={allocated}
                onChange={(e) => setAllocated(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monthly contribution</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={monthlyContribution}
                onChange={(e) => setMonthly(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Target date (optional)</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `GoalsSummaryCard`**

```tsx
// src/components/goals/GoalsSummaryCard.tsx
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGoals } from '@/state/GoalsProvider';
import { selectTotalGoalAllocated, selectTotalGoalTarget } from '@/state/selectors/goalsSelectors';
import { formatMoney } from '@/lib/format';

export function GoalsSummaryCard() {
  const { goals } = useGoals();
  const summary = useMemo(() => {
    const allocated = selectTotalGoalAllocated(goals);
    const target = selectTotalGoalTarget(goals);
    const monthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
    return { allocated, target, monthly, ratio: target > 0 ? allocated / target : 0 };
  }, [goals]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{(summary.ratio * 100).toFixed(1)}%</div>
        <div className="text-muted-foreground text-xs">overall progress</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Saved</div>
            <div className="font-mono">{formatMoney(summary.allocated)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Target</div>
            <div className="font-mono">{formatMoney(summary.target)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Monthly</div>
            <div className="font-mono">{formatMoney(summary.monthly)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `GoalsPage`**

```tsx
// src/pages/GoalsPage.tsx
import { useState } from 'react';
import type { Goal } from '@/types';
import { useGoals } from '@/state/GoalsProvider';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { GoalsList } from '@/components/goals/GoalsList';
import { AddGoalDialog } from '@/components/goals/AddGoalDialog';
import { GoalsSummaryCard } from '@/components/goals/GoalsSummaryCard';

export function GoalsPage() {
  const { goals, addGoal, updateGoal, removeGoal } = useGoals();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>(undefined);

  const onAdd = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const onEdit = (g: Goal) => {
    setEditing(g);
    setDialogOpen(true);
  };
  const onSave = (g: Omit<Goal, 'id'> | Goal) => {
    if ('id' in g) updateGoal(g);
    else addGoal(g);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Goals</h1>
        <Button onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add goal
        </Button>
      </div>
      <GoalsSummaryCard />
      <GoalsList goals={goals} onEdit={onEdit} onDelete={removeGoal} />
      <AddGoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSave={onSave}
      />
    </div>
  );
}
```

- [ ] **Step 4: Wire route**

Edit `src/AppRoutes.tsx`:

```tsx
import { GoalsPage } from '@/pages/GoalsPage';
// ...
<Route path="/goals" element={<GoalsPage />} />;
```

- [ ] **Step 5: Smoke test in browser**

Run: `npm run dev`
Open: `http://localhost:8080/goals`
Expected: page renders; add/edit/delete works; progress bar fills.

- [ ] **Step 6: Commit**

```bash
git add src/components/goals/AddGoalDialog.tsx src/components/goals/GoalsSummaryCard.tsx src/pages/GoalsPage.tsx src/AppRoutes.tsx
git commit -m "feat(goals): page with progress tracking"
```

---

## Task 11: Surface NetWorth + Goals on Dashboard

**Files:**

- Modify: `src/pages/DashboardPage.tsx`

The Dashboard from Plan 2 already has `GuiltFreeCard`, `BucketBreakdown`, etc. Add a small grid of summary cards.

- [ ] **Step 1: Update Dashboard**

Append below existing cards:

```tsx
import { NetWorthCard } from '@/components/assets/NetWorthCard';
import { DebtSummaryCard } from '@/components/debt/DebtSummaryCard';
import { GoalsSummaryCard } from '@/components/goals/GoalsSummaryCard';

// inside the page, after the existing income/expense overview:
<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
  <NetWorthCard />
  <DebtSummaryCard />
  <GoalsSummaryCard />
</div>;
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev`
Open: `http://localhost:8080/`
Expected: dashboard shows net worth, debt total, goals progress alongside the guilt-free card.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): surface net worth, debt, goals"
```

---

## Task 12: Sidebar nav entries

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add nav entries**

In the existing nav array, add Assets, Debt, Goals:

```tsx
import { Wallet, CreditCard, Target } from 'lucide-react';

const NAV = [
  // ... existing entries
  { to: '/assets', label: 'Assets', icon: Wallet },
  { to: '/debt', label: 'Debt', icon: CreditCard },
  { to: '/goals', label: 'Goals', icon: Target },
];
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev`
Click each new sidebar entry. Expected: navigates correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(layout): sidebar links for assets/debt/goals"
```

---

## Task 13: E2E flow

**Files:**

- Create: `e2e/assets-debt-goals.spec.ts`

- [ ] **Step 1: Write E2E**

```ts
// e2e/assets-debt-goals.spec.ts
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
});

test('add asset, debt, and goal — see them on dashboard', async ({ page }) => {
  // Setup wizard
  await page.goto('/');
  await page.getByLabel('Household name').fill('Test');
  await page.getByRole('button', { name: /Get started/i }).click();

  // Asset
  await page.goto('/assets');
  await page.getByRole('button', { name: /Add asset/i }).click();
  await page.getByLabel('Name').fill('Savings');
  await page.getByLabel('Balance').fill('5000');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Savings')).toBeVisible();
  await expect(page.getByText('$5,000')).toBeVisible();

  // Debt
  await page.goto('/debt');
  await page.getByRole('button', { name: /Add debt/i }).click();
  await page.getByLabel('Name').fill('Visa');
  await page.getByLabel('Balance').fill('2000');
  await page.getByLabel('APR (%)').fill('22');
  await page.getByLabel('Minimum monthly payment').fill('50');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Visa')).toBeVisible();

  // Goal
  await page.goto('/goals');
  await page.getByRole('button', { name: /Add goal/i }).click();
  await page.getByLabel('Name').fill('Emergency Fund');
  await page.getByLabel('Target').fill('10000');
  await page.getByLabel('Already saved').fill('2500');
  await page.getByLabel('Monthly contribution').fill('500');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Emergency Fund')).toBeVisible();
  await expect(page.getByText('25.0%')).toBeVisible();

  // Dashboard reflection
  await page.goto('/');
  await expect(page.getByText('Net Worth')).toBeVisible();
  await expect(page.getByText('Total Debt')).toBeVisible();
  await expect(page.getByText('Goals Overview')).toBeVisible();
  // Net worth = 5000 - 2000 = 3000
  await expect(page.getByText('$3,000')).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

Run: `npm run test:e2e -- assets-debt-goals`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/assets-debt-goals.spec.ts
git commit -m "test(e2e): assets/debt/goals add flow"
```

---

## Task 14: Final gate

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors / 0 warnings.

- [ ] **Step 3: Unit tests**

Run: `npm run test`
Expected: all pass — including networth (7) and goals (10) suites.

- [ ] **Step 4: E2E**

Run: `npm run test:e2e`
Expected: all pass.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Final commit**

If anything was tweaked:

```bash
git add -A
git commit -m "chore(plan-3): final gate green"
```

---

## Self-Review Notes

- Spec coverage: §3 Pages (Assets, Debt, Goals), §4 Data Model (Asset/Debt/Goal already in Plan 1). Net worth view & goal progress derive from selectors here.
- All file paths are exact.
- All `Asset`/`Debt`/`Goal` field names match Plan 1's type definitions (`balance`, `apr`, `minPayment`, `ownerId`, `target`, `allocated`, `monthlyContribution`, `targetDate?`).
- `useAssets`, `useDebts`, `useGoals` from Plan 1 expose `addAsset/updateAsset/removeAsset` etc. (consistent with `useEntityReducer`).
- No placeholders. Every step shows code or exact command.
