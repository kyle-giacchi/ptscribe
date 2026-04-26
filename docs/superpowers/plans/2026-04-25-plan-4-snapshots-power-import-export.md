# Plan 4 — Snapshots, Power Mode, Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out v1 by (a) auto-snapshotting the living plan on a schedule, (b) wiring the Simple/Power-mode progressive disclosure on every summary page with deeper breakdowns + charts, and (c) bootstrapping the app from the user's existing xlsx + supporting CSV import/export and JSON backup/restore.

**Architecture:** Snapshots run from a `useSnapshotScheduler` hook attached at app shell; Power blocks consume the same selectors as Simple cards. xlsx import is a one-shot bootstrap that writes once to `AppDataProvider`. CSV import is a generic transactional importer for expenses. JSON backup is a flat export of the full `AppData` blob.

**Tech Stack:** exceljs (xlsx), papaparse (csv), recharts (charts), date-fns is **not** added — keep date math inline with `Date`/ISO strings to avoid bloat.

**Prerequisites:** Plans 1–3 merged. `SnapshotsProvider`, `Snapshot` type, and `UIStateProvider.mode` already exist from Plan 1. The reference xlsx lives at `groupfinanceapp.xlsx` at repo root and is gitignored.

---

## File Structure

**Snapshots:**

- Create: `src/lib/snapshots/buildSnapshot.ts` — pure function that converts current `AppData` into a `Snapshot`
- Create: `src/lib/snapshots/__tests__/buildSnapshot.test.ts`
- Create: `src/hooks/useSnapshotScheduler.ts` — runs on app mount, snapshots monthly
- Create: `src/components/snapshots/SnapshotHistoryTable.tsx`
- Create: `src/pages/HistoryPage.tsx`

**Power-mode blocks (one per page, each gated on `mode === 'power'`):**

- Create: `src/components/dashboard/power/DashboardPowerBlock.tsx`
- Create: `src/components/income/power/IncomePowerBlock.tsx`
- Create: `src/components/expenses/power/ExpensesPowerBlock.tsx`
- Create: `src/components/assets/power/AssetsPowerBlock.tsx`
- Create: `src/components/debt/power/DebtPowerBlock.tsx`
- Create: `src/components/goals/power/GoalsPowerBlock.tsx`
- Create: `src/components/common/PowerBlock.tsx` — shared wrapper that conditionally renders children

**Import / Export:**

- Create: `src/lib/io/xlsxBootstrap.ts` — read groupfinanceapp.xlsx and produce a draft `AppData`
- Create: `src/lib/io/__tests__/xlsxBootstrap.test.ts`
- Create: `src/lib/io/csvExpenses.ts` — parse + write expense CSVs via papaparse
- Create: `src/lib/io/__tests__/csvExpenses.test.ts`
- Create: `src/lib/io/jsonBackup.ts` — full AppData export/restore
- Create: `src/lib/io/__tests__/jsonBackup.test.ts`
- Create: `src/components/io/ImportXlsxButton.tsx`
- Create: `src/components/io/ImportCsvButton.tsx`
- Create: `src/components/io/ExportButtons.tsx`
- Create: `src/pages/SettingsPage.tsx` (or extend if exists)

**Routing/Layout:**

- Modify: `src/AppRoutes.tsx` — add `/history`, ensure `/settings`
- Modify: `src/components/layout/Sidebar.tsx` — add History entry
- Modify: `src/components/layout/AppShell.tsx` — mount `useSnapshotScheduler`

---

## Task 1: buildSnapshot pure function

**Files:**

- Create: `src/lib/snapshots/buildSnapshot.ts`
- Test: `src/lib/snapshots/__tests__/buildSnapshot.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/snapshots/__tests__/buildSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../buildSnapshot';
import type { AppData } from '@/types';

const baseData: AppData = {
  household: {
    id: 'h',
    name: 'Test',
    members: [{ id: 'm1', name: 'A' }],
    settings: { splitMode: 'couples' },
  },
  incomes: [{ id: 'i1', memberId: 'm1', source: 'job', grossAnnual: 100_000, preTaxDeductions: 0 }],
  expenses: [
    {
      id: 'e1',
      name: 'Rent',
      category: 'fixed',
      amount: 2000,
      cadence: 'monthly',
      split: { kind: 'equal' },
    },
  ],
  taxConfig: { filingStatus: 'single', state: 'TX', stateRate: 0, federalBrackets: [] },
  assets: [{ id: 'a1', name: 'Cash', type: 'cash', balance: 10_000, ownerId: 'm1' }],
  debts: [
    {
      id: 'd1',
      name: 'Visa',
      type: 'credit_card',
      balance: 1_000,
      apr: 20,
      minPayment: 25,
      ownerId: 'm1',
    },
  ],
  goals: [
    { id: 'g1', name: 'Vacation', target: 5_000, allocated: 1_000, monthlyContribution: 200 },
  ],
  snapshots: [],
  uiState: { mode: 'simple' },
};

describe('buildSnapshot', () => {
  it('captures totals at a moment in time', () => {
    const snap = buildSnapshot(baseData, '2026-04-01');
    expect(snap.takenAt).toBe('2026-04-01');
    expect(snap.totals.assets).toBe(10_000);
    expect(snap.totals.debts).toBe(1_000);
    expect(snap.totals.netWorth).toBe(9_000);
    expect(snap.totals.grossIncomeAnnual).toBe(100_000);
    expect(snap.totals.expensesAnnual).toBe(2_000 * 12);
    expect(snap.totals.goalsAllocated).toBe(1_000);
  });

  it('generates a stable id', () => {
    const a = buildSnapshot(baseData, '2026-04-01');
    expect(a.id).toMatch(/^snap-/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- buildSnapshot`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/snapshots/buildSnapshot.ts
import type { AppData, Snapshot } from '@/types';
import { totalAssets, totalDebts } from '@/lib/finance/networth';
import { totalGrossIncomeForHousehold } from '@/lib/finance/income';
import { toAnnual } from '@/lib/finance/expenses';

export function buildSnapshot(data: AppData, takenAt: string): Snapshot {
  const grossIncomeAnnual = totalGrossIncomeForHousehold(data.incomes);
  const expensesAnnual = data.expenses.reduce((sum, e) => sum + toAnnual(e.amount, e.cadence), 0);
  const assets = totalAssets(data.assets);
  const debts = totalDebts(data.debts);
  const goalsAllocated = data.goals.reduce((s, g) => s + g.allocated, 0);

  return {
    id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    takenAt,
    totals: {
      grossIncomeAnnual,
      expensesAnnual,
      assets,
      debts,
      netWorth: assets - debts,
      goalsAllocated,
    },
  };
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- buildSnapshot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/snapshots/buildSnapshot.ts src/lib/snapshots/__tests__/buildSnapshot.test.ts
git commit -m "feat(snapshots): pure buildSnapshot function"
```

---

## Task 2: useSnapshotScheduler hook

**Files:**

- Create: `src/hooks/useSnapshotScheduler.ts`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Implement scheduler**

Snapshots take place once per calendar month, at first app mount of that month.

```ts
// src/hooks/useSnapshotScheduler.ts
import { useEffect } from 'react';
import { useAppData } from '@/state/AppDataProvider';
import { useSnapshots } from '@/state/SnapshotsProvider';
import { buildSnapshot } from '@/lib/snapshots/buildSnapshot';

function monthKey(iso: string): string {
  return iso.slice(0, 7); // 'YYYY-MM'
}

export function useSnapshotScheduler() {
  const { data } = useAppData();
  const { snapshots, addSnapshot } = useSnapshots();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = monthKey(today);
    const haveThisMonth = snapshots.some((s) => monthKey(s.takenAt) === thisMonth);
    if (haveThisMonth) return;
    const snap = buildSnapshot(data, today);
    addSnapshot(snap);
    // run only once per mount; provider state updates won't re-trigger because
    // `haveThisMonth` flips to true after the add
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 2: Mount in AppShell**

In `src/components/layout/AppShell.tsx`, call the hook at the top of the component:

```tsx
import { useSnapshotScheduler } from '@/hooks/useSnapshotScheduler';
// ...
export function AppShell({ children }: { children: React.ReactNode }) {
  useSnapshotScheduler();
  // ... existing JSX
}
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
Open the app fresh. Open localStorage in devtools. Expected: a `snapshots` array entry exists with this month's `takenAt`.

Reload — expected: no second snapshot for the same month.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSnapshotScheduler.ts src/components/layout/AppShell.tsx
git commit -m "feat(snapshots): monthly auto-scheduler"
```

---

## Task 3: SnapshotHistoryTable + HistoryPage

**Files:**

- Create: `src/components/snapshots/SnapshotHistoryTable.tsx`
- Create: `src/pages/HistoryPage.tsx`
- Modify: `src/AppRoutes.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write `SnapshotHistoryTable`**

```tsx
// src/components/snapshots/SnapshotHistoryTable.tsx
import type { Snapshot } from '@/types';
import { formatMoney } from '@/lib/format';

interface Props {
  snapshots: Snapshot[];
}

export function SnapshotHistoryTable({ snapshots }: Props) {
  if (snapshots.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No snapshots yet. They are taken automatically each month.
      </p>
    );
  }
  const ordered = [...snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-left">
        <tr>
          <th className="px-3 py-2 font-medium">Date</th>
          <th className="px-3 py-2 text-right font-medium">Net Worth</th>
          <th className="px-3 py-2 text-right font-medium">Assets</th>
          <th className="px-3 py-2 text-right font-medium">Debts</th>
          <th className="px-3 py-2 text-right font-medium">Income (yr)</th>
          <th className="px-3 py-2 text-right font-medium">Expenses (yr)</th>
          <th className="px-3 py-2 text-right font-medium">Goals saved</th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((s) => (
          <tr key={s.id} className="border-b last:border-b-0">
            <td className="px-3 py-2">{s.takenAt}</td>
            <td className="px-3 py-2 text-right font-mono">{formatMoney(s.totals.netWorth)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatMoney(s.totals.assets)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatMoney(s.totals.debts)}</td>
            <td className="px-3 py-2 text-right font-mono">
              {formatMoney(s.totals.grossIncomeAnnual)}
            </td>
            <td className="px-3 py-2 text-right font-mono">
              {formatMoney(s.totals.expensesAnnual)}
            </td>
            <td className="px-3 py-2 text-right font-mono">
              {formatMoney(s.totals.goalsAllocated)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Write `HistoryPage`**

```tsx
// src/pages/HistoryPage.tsx
import { useSnapshots } from '@/state/SnapshotsProvider';
import { SnapshotHistoryTable } from '@/components/snapshots/SnapshotHistoryTable';

export function HistoryPage() {
  const { snapshots } = useSnapshots();
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">History</h1>
      <p className="text-muted-foreground text-sm">
        A snapshot of your finances is taken automatically once per month.
      </p>
      <div className="rounded-lg border">
        <SnapshotHistoryTable snapshots={snapshots} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire route + sidebar**

`src/AppRoutes.tsx`:

```tsx
import { HistoryPage } from '@/pages/HistoryPage';
// ...
<Route path="/history" element={<HistoryPage />} />;
```

`src/components/layout/Sidebar.tsx` — add to NAV array:

```tsx
import { History } from 'lucide-react';
// inside NAV array:
{ to: '/history', label: 'History', icon: History },
```

- [ ] **Step 4: Smoke test**

Run: `npm run dev`
Open: `http://localhost:8080/history`
Expected: this month's snapshot is listed.

- [ ] **Step 5: Commit**

```bash
git add src/components/snapshots/SnapshotHistoryTable.tsx src/pages/HistoryPage.tsx src/AppRoutes.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(snapshots): history page"
```

---

## Task 4: Shared PowerBlock wrapper

**Files:**

- Create: `src/components/common/PowerBlock.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/common/PowerBlock.tsx
import type { ReactNode } from 'react';
import { useUIState } from '@/state/UIStateProvider';

interface Props {
  title?: string;
  children: ReactNode;
}

export function PowerBlock({ title, children }: Props) {
  const { uiState } = useUIState();
  if (uiState.mode !== 'power') return null;
  return (
    <section className="bg-muted/30 space-y-3 rounded-lg border border-dashed p-4">
      {title && (
        <header className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
            POWER
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </header>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/PowerBlock.tsx
git commit -m "feat(common): PowerBlock progressive-disclosure wrapper"
```

---

## Task 5: Dashboard Power block (net worth trend chart)

**Files:**

- Create: `src/components/dashboard/power/DashboardPowerBlock.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/dashboard/power/DashboardPowerBlock.tsx
import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { PowerBlock } from '@/components/common/PowerBlock';
import { useSnapshots } from '@/state/SnapshotsProvider';
import { formatMoney } from '@/lib/format';

export function DashboardPowerBlock() {
  const { snapshots } = useSnapshots();
  const series = useMemo(
    () =>
      [...snapshots]
        .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
        .map((s) => ({
          date: s.takenAt,
          netWorth: s.totals.netWorth,
          assets: s.totals.assets,
          debts: s.totals.debts,
        })),
    [snapshots],
  );

  return (
    <PowerBlock title="Net Worth Trend">
      {series.length < 2 ? (
        <p className="text-muted-foreground text-sm">
          Need at least two snapshots to draw a trend.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(v) => formatMoney(v)} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Line type="monotone" dataKey="netWorth" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="assets" stroke="#0ea5e9" strokeWidth={1} />
              <Line type="monotone" dataKey="debts" stroke="#f43f5e" strokeWidth={1} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </PowerBlock>
  );
}
```

- [ ] **Step 2: Mount on Dashboard**

In `src/pages/DashboardPage.tsx`, after the existing summary cards:

```tsx
import { DashboardPowerBlock } from '@/components/dashboard/power/DashboardPowerBlock';
// ...
<DashboardPowerBlock />;
```

- [ ] **Step 3: Smoke test**

Toggle mode to Power via the TopBar mode toggle. Expected: trend chart appears (or "need 2 snapshots" if fresh).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/power/DashboardPowerBlock.tsx src/pages/DashboardPage.tsx
git commit -m "feat(power): dashboard net worth trend"
```

---

## Task 6: Income Power block (per-member breakdown)

**Files:**

- Create: `src/components/income/power/IncomePowerBlock.tsx`
- Modify: `src/pages/IncomePage.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/income/power/IncomePowerBlock.tsx
import { useMemo } from 'react';
import { PowerBlock } from '@/components/common/PowerBlock';
import { useIncome } from '@/state/IncomeProvider';
import { useHousehold } from '@/state/HouseholdProvider';
import { useTax } from '@/state/TaxProvider';
import { postTaxIncomeShareByMember } from '@/lib/finance/income';
import { formatMoney, formatPct } from '@/lib/format';

export function IncomePowerBlock() {
  const { incomes } = useIncome();
  const { household } = useHousehold();
  const { taxConfig } = useTax();

  const rows = useMemo(() => {
    const shares = postTaxIncomeShareByMember(incomes, taxConfig);
    const total = Object.values(shares).reduce((s, v) => s + v, 0);
    return household.members.map((m) => ({
      id: m.id,
      name: m.name,
      postTax: shares[m.id] ?? 0,
      ratio: total > 0 ? (shares[m.id] ?? 0) / total : 0,
    }));
  }, [incomes, taxConfig, household.members]);

  return (
    <PowerBlock title="Per-member post-tax breakdown">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Member</th>
            <th className="px-3 py-2 text-right font-medium">Post-tax (yr)</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-right font-mono">{formatMoney(r.postTax)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatPct(r.ratio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PowerBlock>
  );
}
```

- [ ] **Step 2: Mount on IncomePage**

```tsx
import { IncomePowerBlock } from '@/components/income/power/IncomePowerBlock';
// at the bottom of the page JSX:
<IncomePowerBlock />;
```

- [ ] **Step 3: Smoke test**

Toggle Power mode on `/income`. Expected: per-member breakdown appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/income/power/IncomePowerBlock.tsx src/pages/IncomePage.tsx
git commit -m "feat(power): income per-member breakdown"
```

---

## Task 7: Expenses Power block (category pie + cadence-normalized)

**Files:**

- Create: `src/components/expenses/power/ExpensesPowerBlock.tsx`
- Modify: `src/pages/ExpensesPage.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/expenses/power/ExpensesPowerBlock.tsx
import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PowerBlock } from '@/components/common/PowerBlock';
import { useExpenses } from '@/state/ExpensesProvider';
import { toMonthly } from '@/lib/finance/expenses';
import { formatMoney } from '@/lib/format';
import type { Expense } from '@/types';

const COLORS: Record<Expense['category'], string> = {
  fixed: '#3b82f6',
  investments: '#8b5cf6',
  savings: '#10b981',
  guilt_free: '#f59e0b',
};

export function ExpensesPowerBlock() {
  const { expenses } = useExpenses();
  const data = useMemo(() => {
    const totals: Record<Expense['category'], number> = {
      fixed: 0,
      investments: 0,
      savings: 0,
      guilt_free: 0,
    };
    for (const e of expenses) totals[e.category] += toMonthly(e.amount, e.cadence);
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: COLORS[name as Expense['category']] }));
  }, [expenses]);

  if (data.length === 0) {
    return (
      <PowerBlock title="Spend by category">
        <p className="text-muted-foreground text-sm">Add expenses to see a breakdown.</p>
      </PowerBlock>
    );
  }

  return (
    <PowerBlock title="Spend by category (monthly equivalent)">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={90} label>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatMoney(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </PowerBlock>
  );
}
```

- [ ] **Step 2: Mount**

In `src/pages/ExpensesPage.tsx`:

```tsx
import { ExpensesPowerBlock } from '@/components/expenses/power/ExpensesPowerBlock';
// at the bottom of the page JSX:
<ExpensesPowerBlock />;
```

- [ ] **Step 3: Smoke test**

Power mode on `/expenses`. Expected: pie chart appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/expenses/power/ExpensesPowerBlock.tsx src/pages/ExpensesPage.tsx
git commit -m "feat(power): expenses category pie"
```

---

## Task 8: Assets, Debt, Goals Power blocks

**Files:**

- Create: `src/components/assets/power/AssetsPowerBlock.tsx`
- Create: `src/components/debt/power/DebtPowerBlock.tsx`
- Create: `src/components/goals/power/GoalsPowerBlock.tsx`
- Modify: `src/pages/AssetsPage.tsx`, `DebtPage.tsx`, `GoalsPage.tsx`

- [ ] **Step 1: AssetsPowerBlock — by type + by owner**

```tsx
// src/components/assets/power/AssetsPowerBlock.tsx
import { useMemo } from 'react';
import { PowerBlock } from '@/components/common/PowerBlock';
import { useAssets } from '@/state/AssetsProvider';
import { useHousehold } from '@/state/HouseholdProvider';
import { formatMoney } from '@/lib/format';
import type { Asset } from '@/types';

export function AssetsPowerBlock() {
  const { assets } = useAssets();
  const { household } = useHousehold();

  const byType = useMemo(() => {
    const t: Record<Asset['type'], number> = {
      cash: 0,
      crypto: 0,
      investment: 0,
      retirement: 0,
      hsa: 0,
    };
    for (const a of assets) t[a.type] += a.balance;
    return t;
  }, [assets]);

  const byOwner = useMemo(() => {
    const o: Record<string, number> = {};
    for (const a of assets) o[a.ownerId] = (o[a.ownerId] ?? 0) + a.balance;
    return o;
  }, [assets]);

  return (
    <PowerBlock title="Asset breakdowns">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-muted-foreground mb-2 text-xs uppercase">By type</h4>
          <ul className="space-y-1 text-sm">
            {Object.entries(byType).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="font-mono">{formatMoney(v)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-muted-foreground mb-2 text-xs uppercase">By owner</h4>
          <ul className="space-y-1 text-sm">
            {household.members.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.name}</span>
                <span className="font-mono">{formatMoney(byOwner[m.id] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PowerBlock>
  );
}
```

- [ ] **Step 2: DebtPowerBlock — payoff order (avalanche by APR)**

```tsx
// src/components/debt/power/DebtPowerBlock.tsx
import { useMemo } from 'react';
import { PowerBlock } from '@/components/common/PowerBlock';
import { useDebts } from '@/state/DebtsProvider';
import { formatMoney } from '@/lib/format';

export function DebtPowerBlock() {
  const { debts } = useDebts();
  const ordered = useMemo(() => [...debts].sort((a, b) => b.apr - a.apr), [debts]);

  if (ordered.length === 0) return null;

  return (
    <PowerBlock title="Suggested payoff order (avalanche)">
      <ol className="space-y-2 text-sm">
        {ordered.map((d, i) => (
          <li
            key={d.id}
            className="bg-background flex items-center justify-between rounded-md border px-3 py-2"
          >
            <span>
              <span className="text-muted-foreground mr-2">#{i + 1}</span>
              <span className="font-medium">{d.name}</span>
              <span className="text-muted-foreground"> · {d.apr.toFixed(2)}% APR</span>
            </span>
            <span className="font-mono">{formatMoney(d.balance)}</span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">
        Prioritising the highest APR balance saves the most interest over time.
      </p>
    </PowerBlock>
  );
}
```

- [ ] **Step 3: GoalsPowerBlock — months-to-target + monthly-needed-by-date**

```tsx
// src/components/goals/power/GoalsPowerBlock.tsx
import { PowerBlock } from '@/components/common/PowerBlock';
import { useGoals } from '@/state/GoalsProvider';
import { monthsToTarget, monthlyNeededToHitTarget, remainingToTarget } from '@/lib/finance/goals';
import { formatMoney } from '@/lib/format';

function monthsBetween(fromIso: string, toIso: string): number {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  return (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
}

export function GoalsPowerBlock() {
  const { goals } = useGoals();
  if (goals.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PowerBlock title="Goal projections">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Goal</th>
            <th className="px-3 py-2 text-right font-medium">Remaining</th>
            <th className="px-3 py-2 text-right font-medium">ETA at current rate</th>
            <th className="px-3 py-2 text-right font-medium">Needed/mo to hit target date</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => {
            const eta = monthsToTarget(g);
            const months = g.targetDate ? monthsBetween(today, g.targetDate) : 0;
            const needed = g.targetDate ? monthlyNeededToHitTarget(g, months) : 0;
            return (
              <tr key={g.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">{g.name}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatMoney(remainingToTarget(g))}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {eta === Infinity ? '—' : `${eta} mo`}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {g.targetDate ? (needed === Infinity ? '—' : formatMoney(needed)) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PowerBlock>
  );
}
```

- [ ] **Step 4: Mount on each page**

`AssetsPage.tsx`:

```tsx
import { AssetsPowerBlock } from '@/components/assets/power/AssetsPowerBlock';
// at end of JSX:
<AssetsPowerBlock />;
```

`DebtPage.tsx`:

```tsx
import { DebtPowerBlock } from '@/components/debt/power/DebtPowerBlock';
<DebtPowerBlock />;
```

`GoalsPage.tsx`:

```tsx
import { GoalsPowerBlock } from '@/components/goals/power/GoalsPowerBlock';
<GoalsPowerBlock />;
```

- [ ] **Step 5: Smoke test all three**

Toggle Power mode, visit `/assets`, `/debt`, `/goals`. Expected: extra blocks appear/hide.

- [ ] **Step 6: Commit**

```bash
git add src/components/assets/power src/components/debt/power src/components/goals/power src/pages/AssetsPage.tsx src/pages/DebtPage.tsx src/pages/GoalsPage.tsx
git commit -m "feat(power): assets/debt/goals breakdown blocks"
```

---

## Task 9: JSON backup/restore

**Files:**

- Create: `src/lib/io/jsonBackup.ts`
- Test: `src/lib/io/__tests__/jsonBackup.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/io/__tests__/jsonBackup.test.ts
import { describe, it, expect } from 'vitest';
import { exportAppData, importAppData } from '../jsonBackup';
import type { AppData } from '@/types';

const sample: AppData = {
  household: { id: 'h', name: 'Test', members: [], settings: { splitMode: 'roommates' } },
  incomes: [],
  expenses: [],
  taxConfig: { filingStatus: 'single', state: 'CA', stateRate: 0, federalBrackets: [] },
  assets: [],
  debts: [],
  goals: [],
  snapshots: [],
  uiState: { mode: 'simple' },
};

describe('jsonBackup', () => {
  it('round-trips export/import', () => {
    const blob = exportAppData(sample);
    const restored = importAppData(blob);
    expect(restored).toEqual(sample);
  });

  it('rejects invalid json', () => {
    expect(() => importAppData('{not json')).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => importAppData(JSON.stringify({ household: {} }))).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- jsonBackup`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/io/jsonBackup.ts
import type { AppData } from '@/types';
import { AppDataSchema } from '@/types/schema'; // from Plan 1

export function exportAppData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function importAppData(blob: string): AppData {
  const parsed = JSON.parse(blob);
  return AppDataSchema.parse(parsed);
}
```

> **Note:** Plan 1 defines `AppDataSchema` in `src/types/schema.ts`. If the file/path differs, adjust the import path here.

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- jsonBackup`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/io/jsonBackup.ts src/lib/io/__tests__/jsonBackup.test.ts
git commit -m "feat(io): json backup/restore with zod validation"
```

---

## Task 10: CSV expense import/export

**Files:**

- Create: `src/lib/io/csvExpenses.ts`
- Test: `src/lib/io/__tests__/csvExpenses.test.ts`

CSV columns: `name,category,amount,cadence,split_kind`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/io/__tests__/csvExpenses.test.ts
import { describe, it, expect } from 'vitest';
import { parseExpenseCsv, expensesToCsv } from '../csvExpenses';
import type { Expense } from '@/types';

describe('csvExpenses', () => {
  it('parses well-formed rows', () => {
    const csv = `name,category,amount,cadence,split_kind\nRent,fixed,2000,monthly,equal\nSpotify,guilt_free,12,monthly,equal`;
    const rows = parseExpenseCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('Rent');
    expect(rows[0].category).toBe('fixed');
    expect(rows[0].amount).toBe(2000);
    expect(rows[0].cadence).toBe('monthly');
    expect(rows[0].split.kind).toBe('equal');
  });

  it('skips invalid rows', () => {
    const csv = `name,category,amount,cadence,split_kind\nBad,bogus,abc,monthly,equal`;
    const rows = parseExpenseCsv(csv);
    expect(rows.length).toBe(0);
  });

  it('serializes back to csv', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        name: 'Rent',
        category: 'fixed',
        amount: 2000,
        cadence: 'monthly',
        split: { kind: 'equal' },
      },
    ];
    const csv = expensesToCsv(expenses);
    expect(csv).toContain('Rent,fixed,2000,monthly,equal');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- csvExpenses`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/io/csvExpenses.ts
import Papa from 'papaparse';
import type { Expense } from '@/types';

const CATEGORIES: Expense['category'][] = ['fixed', 'investments', 'savings', 'guilt_free'];
const CADENCES: Expense['cadence'][] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];

export function parseExpenseCsv(csv: string): Omit<Expense, 'id'>[] {
  const { data } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const out: Omit<Expense, 'id'>[] = [];
  for (const row of data) {
    const name = (row.name ?? '').trim();
    const category = row.category as Expense['category'];
    const amount = Number(row.amount);
    const cadence = row.cadence as Expense['cadence'];
    const splitKind = row.split_kind ?? 'equal';
    if (!name) continue;
    if (!CATEGORIES.includes(category)) continue;
    if (!CADENCES.includes(cadence)) continue;
    if (!Number.isFinite(amount) || amount < 0) continue;
    out.push({
      name,
      category,
      amount,
      cadence,
      split: { kind: splitKind === 'proportional' ? 'proportional' : 'equal' },
    });
  }
  return out;
}

export function expensesToCsv(expenses: Expense[]): string {
  const rows = expenses.map((e) => ({
    name: e.name,
    category: e.category,
    amount: e.amount,
    cadence: e.cadence,
    split_kind: e.split.kind,
  }));
  return Papa.unparse(rows);
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- csvExpenses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/io/csvExpenses.ts src/lib/io/__tests__/csvExpenses.test.ts
git commit -m "feat(io): expense csv import/export"
```

---

## Task 11: xlsx bootstrap importer

**Files:**

- Create: `src/lib/io/xlsxBootstrap.ts`
- Test: `src/lib/io/__tests__/xlsxBootstrap.test.ts`
- Add to repo (gitignored): `tests/fixtures/sample-finance.xlsx` — a small handcrafted xlsx with the same sheet structure as the real file

The reference workbook has 6 user-visible sheets: `Planning|Intro`, `Planning|Expenses`, `Planning|State of Assests`, `Planning|State of Debt`, `Tax Calculator`, `Goals`.

This task imports the _fixed_ parts (members, expense list, asset list, debt list, goals). Income & tax config require manual entry post-import because formulas drive most cells.

- [ ] **Step 1: Build a tiny fixture xlsx**

Use Node + exceljs to generate the fixture once:

```bash
node -e "
const ExcelJS = require('exceljs');
const wb = new ExcelJS.Workbook();
const exp = wb.addWorksheet('Planning|Expenses');
exp.addRow(['Name','Category','Amount','Cadence']);
exp.addRow(['Rent','fixed',2000,'monthly']);
exp.addRow(['Spotify','guilt_free',12,'monthly']);
const ast = wb.addWorksheet('Planning|State of Assests');
ast.addRow(['Name','Type','Balance','Owner']);
ast.addRow(['Chase','cash',5000,'Member1']);
const dbt = wb.addWorksheet('Planning|State of Debt');
dbt.addRow(['Name','Type','Balance','APR','MinPayment','Owner']);
dbt.addRow(['Visa','credit_card',1500,22,40,'Member1']);
const gls = wb.addWorksheet('Goals');
gls.addRow(['Name','Target','Allocated','Monthly','TargetDate']);
gls.addRow(['Vacation',5000,1000,200,'2026-12-31']);
wb.xlsx.writeFile('tests/fixtures/sample-finance.xlsx').then(() => console.log('done'));
"
```

Add `tests/fixtures/sample-finance.xlsx` to the gitignore allow-list (Plan 1 §12 already permits `tests/fixtures/`).

- [ ] **Step 2: Write failing test**

```ts
// src/lib/io/__tests__/xlsxBootstrap.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootstrapFromXlsx } from '../xlsxBootstrap';

describe('xlsxBootstrap', () => {
  it('extracts expenses, assets, debts, goals from fixture', async () => {
    const buffer = readFileSync(
      resolve(__dirname, '../../../../tests/fixtures/sample-finance.xlsx'),
    );
    const out = await bootstrapFromXlsx(buffer);
    expect(out.expenses.length).toBe(2);
    expect(out.expenses[0].name).toBe('Rent');
    expect(out.expenses[0].amount).toBe(2000);
    expect(out.assets.length).toBe(1);
    expect(out.assets[0].balance).toBe(5000);
    expect(out.debts.length).toBe(1);
    expect(out.debts[0].apr).toBe(22);
    expect(out.goals.length).toBe(1);
    expect(out.goals[0].target).toBe(5000);
  });
});
```

- [ ] **Step 3: Run, verify FAIL**

Run: `npm run test -- xlsxBootstrap`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/io/xlsxBootstrap.ts
import ExcelJS from 'exceljs';
import type { Expense, Asset, Debt, Goal } from '@/types';

export interface BootstrapResult {
  expenses: Omit<Expense, 'id'>[];
  assets: Omit<Asset, 'id' | 'ownerId'>[];
  debts: Omit<Debt, 'id' | 'ownerId'>[];
  goals: Omit<Goal, 'id'>[];
}

export async function bootstrapFromXlsx(buf: Uint8Array | ArrayBuffer): Promise<BootstrapResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);

  const expenses: Omit<Expense, 'id'>[] = [];
  const expSheet = wb.getWorksheet('Planning|Expenses');
  if (expSheet) {
    expSheet.eachRow((row, idx) => {
      if (idx === 1) return; // header
      const [, name, category, amount, cadence] = row.values as unknown[];
      if (!name) return;
      const amt = Number(amount);
      if (!Number.isFinite(amt)) return;
      expenses.push({
        name: String(name),
        category: (category as Expense['category']) ?? 'fixed',
        amount: amt,
        cadence: (cadence as Expense['cadence']) ?? 'monthly',
        split: { kind: 'equal' },
      });
    });
  }

  const assets: Omit<Asset, 'id' | 'ownerId'>[] = [];
  const astSheet = wb.getWorksheet('Planning|State of Assests');
  if (astSheet) {
    astSheet.eachRow((row, idx) => {
      if (idx === 1) return;
      const [, name, type, balance] = row.values as unknown[];
      if (!name) return;
      assets.push({
        name: String(name),
        type: (type as Asset['type']) ?? 'cash',
        balance: Number(balance) || 0,
      });
    });
  }

  const debts: Omit<Debt, 'id' | 'ownerId'>[] = [];
  const dbtSheet = wb.getWorksheet('Planning|State of Debt');
  if (dbtSheet) {
    dbtSheet.eachRow((row, idx) => {
      if (idx === 1) return;
      const [, name, type, balance, apr, minPayment] = row.values as unknown[];
      if (!name) return;
      debts.push({
        name: String(name),
        type: (type as Debt['type']) ?? 'credit_card',
        balance: Number(balance) || 0,
        apr: Number(apr) || 0,
        minPayment: Number(minPayment) || 0,
      });
    });
  }

  const goals: Omit<Goal, 'id'>[] = [];
  const glSheet = wb.getWorksheet('Goals');
  if (glSheet) {
    glSheet.eachRow((row, idx) => {
      if (idx === 1) return;
      const [, name, target, allocated, monthly, targetDate] = row.values as unknown[];
      if (!name) return;
      goals.push({
        name: String(name),
        target: Number(target) || 0,
        allocated: Number(allocated) || 0,
        monthlyContribution: Number(monthly) || 0,
        targetDate: targetDate ? String(targetDate) : undefined,
      });
    });
  }

  return { expenses, assets, debts, goals };
}
```

- [ ] **Step 5: Run, verify PASS**

Run: `npm run test -- xlsxBootstrap`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/io/xlsxBootstrap.ts src/lib/io/__tests__/xlsxBootstrap.test.ts tests/fixtures/sample-finance.xlsx
git commit -m "feat(io): xlsx bootstrap importer"
```

---

## Task 12: Import/Export UI buttons + Settings page

**Files:**

- Create: `src/components/io/ImportXlsxButton.tsx`
- Create: `src/components/io/ImportCsvButton.tsx`
- Create: `src/components/io/ExportButtons.tsx`
- Create / extend: `src/pages/SettingsPage.tsx`
- Modify: `src/AppRoutes.tsx`, `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: ImportXlsxButton**

```tsx
// src/components/io/ImportXlsxButton.tsx
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { bootstrapFromXlsx } from '@/lib/io/xlsxBootstrap';
import { useAssets } from '@/state/AssetsProvider';
import { useDebts } from '@/state/DebtsProvider';
import { useExpenses } from '@/state/ExpensesProvider';
import { useGoals } from '@/state/GoalsProvider';
import { useHousehold } from '@/state/HouseholdProvider';

export function ImportXlsxButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>('');
  const { household } = useHousehold();
  const { addAsset } = useAssets();
  const { addDebt } = useDebts();
  const { addExpense } = useExpenses();
  const { addGoal } = useGoals();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const result = await bootstrapFromXlsx(buf);
    const ownerId = household.members[0]?.id;
    if (!ownerId) {
      setStatus('Add at least one household member first.');
      return;
    }
    result.expenses.forEach((x) => addExpense(x));
    result.assets.forEach((a) => addAsset({ ...a, ownerId }));
    result.debts.forEach((d) => addDebt({ ...d, ownerId }));
    result.goals.forEach((g) => addGoal(g));
    setStatus(
      `Imported ${result.expenses.length} expenses, ${result.assets.length} assets, ${result.debts.length} debts, ${result.goals.length} goals.`,
    );
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={onFile} />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-1 h-4 w-4" />
        Import from xlsx
      </Button>
      {status && <p className="text-muted-foreground text-xs">{status}</p>}
    </div>
  );
}
```

- [ ] **Step 2: ImportCsvButton (expenses only)**

```tsx
// src/components/io/ImportCsvButton.tsx
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { parseExpenseCsv } from '@/lib/io/csvExpenses';
import { useExpenses } from '@/state/ExpensesProvider';

export function ImportCsvButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const { addExpense } = useExpenses();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseExpenseCsv(text);
    rows.forEach((r) => addExpense(r));
    setStatus(`Imported ${rows.length} expenses.`);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept=".csv" hidden onChange={onFile} />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-1 h-4 w-4" />
        Import expenses CSV
      </Button>
      {status && <p className="text-muted-foreground text-xs">{status}</p>}
    </div>
  );
}
```

- [ ] **Step 3: ExportButtons (JSON + CSV)**

```tsx
// src/components/io/ExportButtons.tsx
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { exportAppData } from '@/lib/io/jsonBackup';
import { expensesToCsv } from '@/lib/io/csvExpenses';
import { useAppData } from '@/state/AppDataProvider';
import { useExpenses } from '@/state/ExpensesProvider';

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons() {
  const { data } = useAppData();
  const { expenses } = useExpenses();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() =>
          downloadFile(`groupfinance-backup-${today}.json`, exportAppData(data), 'application/json')
        }
      >
        <Download className="mr-1 h-4 w-4" />
        Export JSON backup
      </Button>
      <Button
        variant="outline"
        onClick={() => downloadFile(`expenses-${today}.csv`, expensesToCsv(expenses), 'text/csv')}
      >
        <Download className="mr-1 h-4 w-4" />
        Export expenses CSV
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: SettingsPage**

```tsx
// src/pages/SettingsPage.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportXlsxButton } from '@/components/io/ImportXlsxButton';
import { ImportCsvButton } from '@/components/io/ImportCsvButton';
import { ExportButtons } from '@/components/io/ExportButtons';

export function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ImportXlsxButton />
          <ImportCsvButton />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent>
          <ExportButtons />
          <p className="text-muted-foreground mt-3 text-xs">
            JSON backup includes everything. Re-importing is not yet supported in v1 — keep the file
            safe in case you need to copy values back manually.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Wire route + sidebar**

`src/AppRoutes.tsx`:

```tsx
import { SettingsPage } from '@/pages/SettingsPage';
<Route path="/settings" element={<SettingsPage />} />;
```

`src/components/layout/Sidebar.tsx`:

```tsx
import { Settings as SettingsIcon } from 'lucide-react';
{ to: '/settings', label: 'Settings', icon: SettingsIcon },
```

- [ ] **Step 6: Smoke test**

Run: `npm run dev`
Open `/settings`. Click "Export JSON backup". Expected: file downloads.

Pick the fixture xlsx via "Import from xlsx". Expected: status message reports count, expenses/assets/debts/goals appear on their pages.

- [ ] **Step 7: Commit**

```bash
git add src/components/io src/pages/SettingsPage.tsx src/AppRoutes.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(io): import/export UI on settings page"
```

---

## Task 13: E2E for Power mode toggle and import

**Files:**

- Create: `e2e/power-mode.spec.ts`
- Create: `e2e/import-export.spec.ts`

- [ ] **Step 1: Power mode E2E**

```ts
// e2e/power-mode.spec.ts
import { test, expect } from '@playwright/test';

test('power mode reveals breakdown blocks', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');

  // skim setup wizard
  await page.getByLabel('Household name').fill('Test');
  await page.getByRole('button', { name: /Get started/i }).click();

  // simple mode -- no power blocks
  await page.goto('/expenses');
  await expect(page.getByText('POWER')).toHaveCount(0);

  // toggle to power
  await page.getByRole('switch', { name: /Power/i }).click();
  await expect(page.locator('text=POWER').first()).toBeVisible();
});
```

- [ ] **Step 2: Import/Export E2E**

```ts
// e2e/import-export.spec.ts
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('xlsx import populates expenses/assets/debts/goals', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');

  await page.getByLabel('Household name').fill('Importers');
  await page.getByRole('button', { name: /Get started/i }).click();

  await page.goto('/settings');
  const file = resolve(__dirname, '../tests/fixtures/sample-finance.xlsx');
  await page.setInputFiles('input[type="file"]', file);
  await expect(page.getByText(/Imported \d+ expenses/)).toBeVisible();

  await page.goto('/expenses');
  await expect(page.getByText('Rent')).toBeVisible();
  await page.goto('/assets');
  await expect(page.getByText('Chase')).toBeVisible();
  await page.goto('/debt');
  await expect(page.getByText('Visa')).toBeVisible();
  await page.goto('/goals');
  await expect(page.getByText('Vacation')).toBeVisible();
});
```

- [ ] **Step 3: Run E2E**

Run: `npm run test:e2e -- power-mode import-export`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/power-mode.spec.ts e2e/import-export.spec.ts
git commit -m "test(e2e): power mode + xlsx import"
```

---

## Task 14: Final v1 gate

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors / 0 warnings.

- [ ] **Step 3: Unit tests (full suite)**

Run: `npm run test`
Expected: every suite green — buildSnapshot, jsonBackup (3), csvExpenses (3), xlsxBootstrap (1), plus everything from Plans 1–3.

- [ ] **Step 4: E2E (full suite)**

Run: `npm run test:e2e`
Expected: every spec green.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Manual smoke**

Open `npm run dev`, walk through:

1. Setup wizard
2. Add income → see guilt-free on dashboard
3. Add expenses → see buckets
4. Add assets/debts → see net worth
5. Add goals → see progress
6. Toggle Power → see all power blocks
7. Settings → Export JSON
8. Settings → Import xlsx fixture (in a fresh localStorage state)
9. Visit `/history` — confirm month snapshot present

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(plan-4): v1 gate green"
```

---

## Self-Review Notes

- **Spec coverage:**
  - §3.7 History page → Tasks 1–3
  - §6 Power Mode (progressive disclosure on every page) → Tasks 4–8
  - §8 Import/Export → Tasks 9–12
- **Type consistency:** `Snapshot.totals.{netWorth,assets,debts,grossIncomeAnnual,expensesAnnual,goalsAllocated}` matches the type defined in Plan 1.
- **No placeholders:** every step has runnable code or an exact command.
- **Risks called out:** xlsx fixture is small/synthetic — the real workbook contains formulas; Tasks 11/12 deliberately skip income+tax import because formulas drive most cells. Documented in the SettingsPage UI text.

---

## All Plans Complete

Plans 1–4 are now committed:

1. **Plan 1 — Foundation** (`docs/superpowers/plans/2026-04-25-plan-1-foundation.md`) — scaffold, types, providers, persistence, layout, setup wizard.
2. **Plan 2 — Income / Expenses / Tax / Dashboard** (`...plan-2-income-expenses-tax-dashboard.md`) — the headline guilt-free number.
3. **Plan 3 — Assets / Debt / Goals** (`...plan-3-assets-debt-goals.md`) — net worth, debt summary, goal tracking.
4. **Plan 4 — Snapshots / Power Mode / Import-Export** (this file) — v1 closeout.

**Next decision — execution mode:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batched checkpoints.

Which approach?
