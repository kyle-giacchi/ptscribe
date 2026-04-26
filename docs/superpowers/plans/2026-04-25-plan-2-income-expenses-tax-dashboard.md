# Plan 2 — Income, Expenses, Tax & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headline-value features: enter income (per-member, with pre-tax), define expenses (with split overrides + paidBy), compute taxes (federal + optional state), allocate expenses across members, and surface Guilt-Free Money on the dashboard.

**Architecture:** All math lives in pure functions under `src/lib/finance/` — no React, fully testable. Components consume memoized selectors. Page UIs are simple form-driven editors that read/write through the slice providers built in Plan 1. The Dashboard composes selectors into a single Simple-mode view (Power additions land in Plan 4).

**Tech Stack:** Same as Plan 1 (React 19, TS, Vite, Tailwind 4, Zod, Vitest, Playwright). No new deps.

---

## File Structure

```
src/
  lib/finance/
    tax.ts                        bracket math (estimateFederalTax, marginalRate)
    income.ts                     gross → taxable → post-tax per member
    expenses.ts                   allocation engine (per-member share)
    buckets.ts                    Ramit Conscious Spending bucket calc
    selectors.ts                  memoized aggregate selectors
  hooks/
    useGuiltFree.ts               selector hook for the headline number
  components/
    income/
      IncomeForm.tsx              edit one member's income
      PreTaxBreakdown.tsx         readout of pre-tax dollars
      FilingStatusSelector.tsx
    expenses/
      ExpenseTable.tsx            list editor
      ExpenseRow.tsx              single row
      AddExpenseDialog.tsx
      SplitOverrideEditor.tsx     dialog to set per-line split
      CategoryPills.tsx
    tax/
      BracketEditor.tsx           edit/reset brackets per filing status
      TaxSummaryCard.tsx          read-only output
    dashboard/
      GuiltFreeCard.tsx           the headline number
      BucketBreakdown.tsx         Fixed/Investments/Savings/Guilt-Free
      AlertList.tsx               status messages (negative, missing data)
      IncomeOverviewCard.tsx
      ExpenseOverviewCard.tsx
  pages/
    Dashboard.tsx                 (rewrite stub)
    Income.tsx                    (rewrite stub)
    Expenses.tsx                  (rewrite stub)
    TaxCalculator.tsx             (rewrite stub)
tests/
  flows.spec.ts                   E2E: setup → enter data → see guilt-free
```

---

## Task 1: Federal tax engine

**Files:**

- Create: `src/lib/finance/tax.ts`
- Test: `src/lib/finance/tax.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finance/tax.test.ts
import { describe, expect, it } from 'vitest';
import { estimateFederalTax, marginalRate, totalBracketRoom } from './tax';
import { DEFAULT_BRACKETS_2026 } from '@/schemas';

describe('estimateFederalTax', () => {
  it('returns 0 for $0 taxable income', () => {
    expect(estimateFederalTax(0, 'single', DEFAULT_BRACKETS_2026)).toBe(0);
  });

  it('applies 10% to income within first bracket (single)', () => {
    expect(estimateFederalTax(10_000, 'single', DEFAULT_BRACKETS_2026)).toBeCloseTo(1_000, 2);
  });

  it('progressively stacks across brackets', () => {
    // 50,000 single = 1160 (10% on first 11,600) + 12% on (47,150 - 11,600) + 22% on (50,000 - 47,150)
    // = 1160 + 4266 + 627 = 6053
    expect(estimateFederalTax(50_000, 'single', DEFAULT_BRACKETS_2026)).toBeCloseTo(6053, 0);
  });

  it('uses joint brackets for married_joint', () => {
    // 50,000 joint stays in 12% bracket entirely above 10% layer
    // = 2320 (10% on 23,200) + 12% on (50,000 - 23,200) = 2320 + 3216 = 5536
    expect(estimateFederalTax(50_000, 'married_joint', DEFAULT_BRACKETS_2026)).toBeCloseTo(5536, 0);
  });

  it('throws on negative income', () => {
    expect(() => estimateFederalTax(-1, 'single', DEFAULT_BRACKETS_2026)).toThrow();
  });
});

describe('marginalRate', () => {
  it('returns the rate of the topmost bracket landed in', () => {
    expect(marginalRate(50_000, 'single', DEFAULT_BRACKETS_2026)).toBe(0.22);
    expect(marginalRate(10_000, 'single', DEFAULT_BRACKETS_2026)).toBe(0.1);
  });
});

describe('totalBracketRoom', () => {
  it('returns headroom in current bracket', () => {
    // 50,000 single is in 22% bracket (47,150 → 100,525)
    expect(totalBracketRoom(50_000, 'single', DEFAULT_BRACKETS_2026)).toBeCloseTo(50_525, 0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/finance/tax.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/finance/tax.ts`**

```ts
import type { FilingStatus, TaxBrackets } from '@/types';

export function estimateFederalTax(
  taxableIncome: number,
  filingStatus: FilingStatus,
  brackets: TaxBrackets,
): number {
  if (taxableIncome < 0) throw new Error('estimateFederalTax: taxableIncome cannot be negative');
  if (taxableIncome === 0) return 0;

  const tiers = brackets[filingStatus];
  let remaining = taxableIncome;
  let lastUpper = 0;
  let tax = 0;

  for (const tier of tiers) {
    const upper = tier.upTo ?? Infinity;
    const slice = Math.min(remaining, upper - lastUpper);
    if (slice <= 0) break;
    tax += slice * tier.rate;
    remaining -= slice;
    lastUpper = upper;
    if (remaining <= 0) break;
  }
  return tax;
}

export function marginalRate(
  taxableIncome: number,
  filingStatus: FilingStatus,
  brackets: TaxBrackets,
): number {
  const tiers = brackets[filingStatus];
  let lastUpper = 0;
  for (const tier of tiers) {
    const upper = tier.upTo ?? Infinity;
    if (taxableIncome > lastUpper && taxableIncome <= upper) return tier.rate;
    lastUpper = upper;
  }
  return tiers[tiers.length - 1].rate;
}

export function totalBracketRoom(
  taxableIncome: number,
  filingStatus: FilingStatus,
  brackets: TaxBrackets,
): number {
  const tiers = brackets[filingStatus];
  let lastUpper = 0;
  for (const tier of tiers) {
    const upper = tier.upTo ?? Infinity;
    if (taxableIncome <= upper) return upper - taxableIncome;
    lastUpper = upper;
  }
  return 0;
}

export function estimateStateTax(taxableIncome: number, flatRate?: number): number {
  if (!flatRate || flatRate <= 0) return 0;
  return Math.max(0, taxableIncome) * flatRate;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/finance/tax.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/tax* && git commit -m "feat(finance): add federal/state tax estimator with bracket math"
```

---

## Task 2: Income engine

**Files:**

- Create: `src/lib/finance/income.ts`
- Test: `src/lib/finance/income.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finance/income.test.ts
import { describe, expect, it } from 'vitest';
import {
  taxableIncome,
  postTaxIncome,
  preTaxDollars,
  totalGrossIncomeForHousehold,
  postTaxIncomeShareByMember,
} from './income';
import { DEFAULT_BRACKETS_2026 } from '@/schemas';
import type { MemberIncome } from '@/types';

const kyle: MemberIncome = {
  grossAnnualSalary: 166000,
  payPeriodsPerYear: 26,
  preTax: { contrib401kPct: 0.14, hsaContribAnnual: 7750, rothPct: 0 },
  filingStatus: 'married_joint',
};

const jacque: MemberIncome = {
  grossAnnualSalary: 100000,
  payPeriodsPerYear: 26,
  preTax: { contrib401kPct: 0, hsaContribAnnual: 0, rothPct: 0 },
  filingStatus: 'married_joint',
};

describe('preTaxDollars', () => {
  it('sums 401k% × salary + HSA $', () => {
    expect(preTaxDollars(kyle)).toBeCloseTo(166000 * 0.14 + 7750, 2);
  });
});

describe('taxableIncome', () => {
  it('subtracts pre-tax from gross', () => {
    expect(taxableIncome(kyle)).toBeCloseTo(166000 - (166000 * 0.14 + 7750), 2);
  });
});

describe('postTaxIncome', () => {
  it('subtracts federal + state from taxable', () => {
    const post = postTaxIncome(jacque, DEFAULT_BRACKETS_2026, undefined);
    expect(post).toBeLessThan(jacque.grossAnnualSalary);
    expect(post).toBeGreaterThan(0);
  });
});

describe('totalGrossIncomeForHousehold', () => {
  it('sums all members', () => {
    expect(totalGrossIncomeForHousehold({ k: kyle, j: jacque })).toBe(266000);
  });
});

describe('postTaxIncomeShareByMember', () => {
  it('produces shares that sum to ~1', () => {
    const shares = postTaxIncomeShareByMember(
      { k: kyle, j: jacque },
      DEFAULT_BRACKETS_2026,
      undefined,
    );
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('falls back to equal share when no one earns', () => {
    const zeroIncomes = {
      a: {
        ...kyle,
        grossAnnualSalary: 0,
        preTax: { contrib401kPct: 0, hsaContribAnnual: 0, rothPct: 0 },
      },
      b: { ...jacque, grossAnnualSalary: 0 },
    };
    const shares = postTaxIncomeShareByMember(zeroIncomes, DEFAULT_BRACKETS_2026, undefined);
    expect(shares.a).toBeCloseTo(0.5, 5);
    expect(shares.b).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/finance/income.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/finance/income.ts`**

```ts
import type { MemberId, MemberIncome, TaxBrackets } from '@/types';
import { estimateFederalTax, estimateStateTax } from './tax';

export function preTaxDollars(income: MemberIncome): number {
  const { grossAnnualSalary, preTax } = income;
  return grossAnnualSalary * preTax.contrib401kPct + preTax.hsaContribAnnual;
}

export function taxableIncome(income: MemberIncome): number {
  return Math.max(0, income.grossAnnualSalary - preTaxDollars(income));
}

export function postTaxIncome(
  income: MemberIncome,
  brackets: TaxBrackets,
  stateFlatRate: number | undefined,
): number {
  const taxable = taxableIncome(income);
  const fed = estimateFederalTax(taxable, income.filingStatus, brackets);
  const state = estimateStateTax(taxable, stateFlatRate);
  return Math.max(0, taxable - fed - state);
}

export function totalGrossIncomeForHousehold(byMember: Record<MemberId, MemberIncome>): number {
  return Object.values(byMember).reduce((a, m) => a + m.grossAnnualSalary, 0);
}

export function postTaxIncomeShareByMember(
  byMember: Record<MemberId, MemberIncome>,
  brackets: TaxBrackets,
  stateFlatRate: number | undefined,
): Record<MemberId, number> {
  const ids = Object.keys(byMember);
  if (ids.length === 0) return {};

  const post: Record<MemberId, number> = {};
  let total = 0;
  for (const id of ids) {
    const v = postTaxIncome(byMember[id], brackets, stateFlatRate);
    post[id] = v;
    total += v;
  }

  if (total === 0) {
    const equal = 1 / ids.length;
    return Object.fromEntries(ids.map((id) => [id, equal]));
  }
  return Object.fromEntries(ids.map((id) => [id, post[id] / total]));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/finance/income.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/income* && git commit -m "feat(finance): add income engine (pre-tax, taxable, post-tax, shares)"
```

---

## Task 3: Expense allocation engine

**Files:**

- Create: `src/lib/finance/expenses.ts`
- Test: `src/lib/finance/expenses.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finance/expenses.test.ts
import { describe, expect, it } from 'vitest';
import {
  toAnnual,
  toMonthly,
  allocateExpense,
  allocateAllExpenses,
  totalExpensesByMember,
} from './expenses';
import type { Expense, HouseholdMode, MemberId } from '@/types';

const memberIds: MemberId[] = ['k', 'j'];
const sharesProp: Record<MemberId, number> = { k: 0.62, j: 0.38 };

const housing: Expense = {
  id: 'e1',
  name: 'Housing',
  category: 'essentials',
  cadence: 'annual',
  amount: 28800,
};

describe('cadence helpers', () => {
  it('toAnnual converts monthly correctly', () => {
    expect(toAnnual({ ...housing, cadence: 'monthly', amount: 100 })).toBe(1200);
  });
  it('toMonthly converts annual correctly', () => {
    expect(toMonthly(housing)).toBe(2400);
  });
});

describe('allocateExpense', () => {
  it('uses proportional split for couples mode by default', () => {
    const out = allocateExpense(housing, 'couples', sharesProp, memberIds);
    expect(out.k).toBeCloseTo(housing.amount * 0.62, 2);
    expect(out.j).toBeCloseTo(housing.amount * 0.38, 2);
  });

  it('uses equal split for roommates mode by default', () => {
    const out = allocateExpense(housing, 'roommates', sharesProp, memberIds);
    expect(out.k).toBeCloseTo(housing.amount * 0.5, 2);
    expect(out.j).toBeCloseTo(housing.amount * 0.5, 2);
  });

  it('honors per-line individual override', () => {
    const e: Expense = { ...housing, splitOverride: { kind: 'individual', owner: 'k' } };
    const out = allocateExpense(e, 'couples', sharesProp, memberIds);
    expect(out.k).toBe(housing.amount);
    expect(out.j).toBe(0);
  });

  it('honors per-line fixed_pct override', () => {
    const e: Expense = {
      ...housing,
      splitOverride: { kind: 'fixed_pct', allocations: { k: 0.7, j: 0.3 } },
    };
    const out = allocateExpense(e, 'roommates', sharesProp, memberIds);
    expect(out.k).toBeCloseTo(housing.amount * 0.7, 2);
    expect(out.j).toBeCloseTo(housing.amount * 0.3, 2);
  });

  it('honors per-line equal override even in couples mode', () => {
    const e: Expense = { ...housing, splitOverride: { kind: 'equal' } };
    const out = allocateExpense(e, 'couples', sharesProp, memberIds);
    expect(out.k).toBe(housing.amount * 0.5);
    expect(out.j).toBe(housing.amount * 0.5);
  });
});

describe('allocateAllExpenses + totals', () => {
  it('totals per member across multiple expenses', () => {
    const expenses: Expense[] = [
      { ...housing, amount: 12000 }, // proportional
      {
        id: 'e2',
        name: 'Internet',
        category: 'utilities',
        cadence: 'annual',
        amount: 600,
        splitOverride: { kind: 'individual', owner: 'k' },
      },
    ];
    const totals = totalExpensesByMember(expenses, 'couples', sharesProp, memberIds);
    expect(totals.k).toBeCloseTo(12000 * 0.62 + 600, 2);
    expect(totals.j).toBeCloseTo(12000 * 0.38, 2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/finance/expenses.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/finance/expenses.ts`**

```ts
import type { Expense, HouseholdMode, MemberId, SplitRule } from '@/types';

export function toAnnual(e: Expense): number {
  return e.cadence === 'annual' ? e.amount : e.amount * 12;
}

export function toMonthly(e: Expense): number {
  return e.cadence === 'monthly' ? e.amount : e.amount / 12;
}

function defaultRuleForMode(mode: HouseholdMode): SplitRule {
  return mode === 'couples' ? { kind: 'proportional' } : { kind: 'equal' };
}

export function allocateExpense(
  e: Expense,
  mode: HouseholdMode,
  proportionalShares: Record<MemberId, number>,
  memberIds: MemberId[],
): Record<MemberId, number> {
  const rule = e.splitOverride ?? defaultRuleForMode(mode);
  const annual = toAnnual(e);
  const out: Record<MemberId, number> = {};
  for (const id of memberIds) out[id] = 0;

  switch (rule.kind) {
    case 'proportional': {
      const ids = Object.keys(proportionalShares);
      if (ids.length === 0) return out;
      for (const id of memberIds) out[id] = annual * (proportionalShares[id] ?? 0);
      return out;
    }
    case 'equal': {
      if (memberIds.length === 0) return out;
      const each = annual / memberIds.length;
      for (const id of memberIds) out[id] = each;
      return out;
    }
    case 'fixed_pct': {
      for (const id of memberIds) out[id] = annual * (rule.allocations[id] ?? 0);
      return out;
    }
    case 'individual': {
      out[rule.owner] = annual;
      return out;
    }
  }
}

export function allocateAllExpenses(
  expenses: Expense[],
  mode: HouseholdMode,
  proportionalShares: Record<MemberId, number>,
  memberIds: MemberId[],
): Array<{ expense: Expense; allocation: Record<MemberId, number> }> {
  return expenses.map((expense) => ({
    expense,
    allocation: allocateExpense(expense, mode, proportionalShares, memberIds),
  }));
}

export function totalExpensesByMember(
  expenses: Expense[],
  mode: HouseholdMode,
  proportionalShares: Record<MemberId, number>,
  memberIds: MemberId[],
): Record<MemberId, number> {
  const totals: Record<MemberId, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));
  for (const e of expenses) {
    const a = allocateExpense(e, mode, proportionalShares, memberIds);
    for (const id of memberIds) totals[id] += a[id] ?? 0;
  }
  return totals;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/finance/expenses.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/expenses* && git commit -m "feat(finance): add expense allocation engine with split overrides"
```

---

## Task 4: Conscious Spending bucket calculation

**Files:**

- Create: `src/lib/finance/buckets.ts`
- Test: `src/lib/finance/buckets.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finance/buckets.test.ts
import { describe, expect, it } from 'vitest';
import { computeBuckets } from './buckets';
import type { Expense, Goal } from '@/types';

const expenses: Expense[] = [
  { id: '1', name: 'Rent', category: 'essentials', cadence: 'annual', amount: 24000 },
  { id: '2', name: 'Internet', category: 'utilities', cadence: 'annual', amount: 600 },
  { id: '3', name: 'Health', category: 'insurance', cadence: 'annual', amount: 1800 },
  { id: '4', name: 'Spotify', category: 'subscriptions', cadence: 'annual', amount: 144 },
];

const goals: Goal[] = [
  { id: 'g1', name: 'Wedding', targetAmount: 30000, allocated: 0, monthlyContribution: 500 },
];

describe('computeBuckets', () => {
  it('classifies fixed costs (essentials/utilities/insurance + min debt)', () => {
    const r = computeBuckets({
      annualPostTaxIncome: 200000,
      expenses,
      goals,
      annualMinDebtPayments: 6000,
      annualPostTaxInvestments: 12000,
    });
    expect(r.fixedCostsAnnual).toBe(24000 + 600 + 1800 + 6000);
    expect(r.subscriptionsAnnual).toBe(144);
    expect(r.investmentsAnnual).toBe(12000);
    expect(r.savingsAnnual).toBe(500 * 12);
  });

  it('guilt-free = post-tax income − fixed − investments − savings − subs (subscriptions count as discretionary, not fixed)', () => {
    const r = computeBuckets({
      annualPostTaxIncome: 100000,
      expenses,
      goals: [],
      annualMinDebtPayments: 0,
      annualPostTaxInvestments: 0,
    });
    const fixed = 24000 + 600 + 1800;
    const subs = 144;
    expect(r.guiltFreeAnnual).toBeCloseTo(100000 - fixed - subs, 2);
  });

  it('handles negative guilt-free without crashing', () => {
    const r = computeBuckets({
      annualPostTaxIncome: 10000,
      expenses,
      goals,
      annualMinDebtPayments: 0,
      annualPostTaxInvestments: 0,
    });
    expect(r.guiltFreeAnnual).toBeLessThan(0);
  });

  it('returns target ratio comparisons', () => {
    const r = computeBuckets({
      annualPostTaxIncome: 100000,
      expenses,
      goals: [],
      annualMinDebtPayments: 0,
      annualPostTaxInvestments: 10000,
    });
    expect(r.fixedCostsPct).toBeGreaterThan(0);
    expect(r.investmentsPct).toBeCloseTo(0.1, 4);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/finance/buckets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/finance/buckets.ts`**

```ts
import type { Expense, Goal } from '@/types';
import { toAnnual } from './expenses';

export interface BucketsInput {
  annualPostTaxIncome: number;
  expenses: Expense[];
  goals: Goal[];
  annualMinDebtPayments: number;
  annualPostTaxInvestments: number;
}

export interface BucketsResult {
  // Annual dollar amounts
  fixedCostsAnnual: number;
  subscriptionsAnnual: number;
  investmentsAnnual: number;
  savingsAnnual: number;
  guiltFreeAnnual: number;

  // Percentages of post-tax income
  fixedCostsPct: number;
  investmentsPct: number;
  savingsPct: number;
  guiltFreePct: number;

  // Targets (Ramit Conscious Spending)
  targets: {
    fixedCosts: { min: number; max: number };
    investments: { min: number; max: number };
    savings: { min: number; max: number };
    guiltFree: { min: number; max: number };
  };
}

export function computeBuckets(input: BucketsInput): BucketsResult {
  const { annualPostTaxIncome, expenses, goals, annualMinDebtPayments, annualPostTaxInvestments } =
    input;

  let fixedCostsAnnual = 0;
  let subscriptionsAnnual = 0;
  for (const e of expenses) {
    const annual = toAnnual(e);
    if (e.category === 'essentials' || e.category === 'utilities' || e.category === 'insurance') {
      fixedCostsAnnual += annual;
    } else if (e.category === 'subscriptions') {
      subscriptionsAnnual += annual;
    }
    // 'individual' and 'estimated' are treated as discretionary (folded into guilt-free)
  }
  fixedCostsAnnual += annualMinDebtPayments;

  const savingsAnnual = goals.reduce((a, g) => a + (g.monthlyContribution ?? 0) * 12, 0);
  const investmentsAnnual = annualPostTaxInvestments;

  // Discretionary expenses NOT in fixed (subscriptions, estimated, individual) reduce guilt-free.
  const discretionaryExpensesAnnual = expenses
    .filter(
      (e) =>
        e.category === 'subscriptions' || e.category === 'estimated' || e.category === 'individual',
    )
    .reduce((a, e) => a + toAnnual(e), 0);

  const guiltFreeAnnual =
    annualPostTaxIncome -
    fixedCostsAnnual -
    investmentsAnnual -
    savingsAnnual -
    discretionaryExpensesAnnual;

  const denom = annualPostTaxIncome > 0 ? annualPostTaxIncome : 1;

  return {
    fixedCostsAnnual,
    subscriptionsAnnual,
    investmentsAnnual,
    savingsAnnual,
    guiltFreeAnnual,
    fixedCostsPct: fixedCostsAnnual / denom,
    investmentsPct: investmentsAnnual / denom,
    savingsPct: savingsAnnual / denom,
    guiltFreePct: guiltFreeAnnual / denom,
    targets: {
      fixedCosts: { min: 0.5, max: 0.6 },
      investments: { min: 0.1, max: 0.1 },
      savings: { min: 0.05, max: 0.1 },
      guiltFree: { min: 0.2, max: 0.35 },
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/finance/buckets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/buckets* && git commit -m "feat(finance): add Conscious Spending bucket computation"
```

---

## Task 5: Selectors — memoized aggregates

**Files:**

- Create: `src/lib/finance/selectors.ts`
- Test: `src/lib/finance/selectors.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/finance/selectors.test.ts
import { describe, expect, it } from 'vitest';
import { selectGuiltFreeMonthly, selectHouseholdPostTaxAnnual } from './selectors';
import { defaultAppData, DEFAULT_BRACKETS_2026 } from '@/schemas';
import type { AppData } from '@/types';

function appWithKyleAndJacque(): AppData {
  const base = defaultAppData();
  base.household = {
    name: 'Test',
    mode: 'couples',
    members: [
      { id: 'k', name: 'Kyle' },
      { id: 'j', name: 'Jacque' },
    ],
  };
  base.income = {
    byMember: {
      k: {
        grossAnnualSalary: 166000,
        payPeriodsPerYear: 26,
        preTax: { contrib401kPct: 0.14, hsaContribAnnual: 7750, rothPct: 0 },
        filingStatus: 'married_joint',
      },
      j: {
        grossAnnualSalary: 100000,
        payPeriodsPerYear: 26,
        preTax: { contrib401kPct: 0, hsaContribAnnual: 0, rothPct: 0 },
        filingStatus: 'married_joint',
      },
    },
  };
  base.expenses = [
    { id: 'e1', name: 'Rent', category: 'essentials', cadence: 'annual', amount: 24000 },
  ];
  base.taxConfig = { ...base.taxConfig, brackets: DEFAULT_BRACKETS_2026 };
  return base;
}

describe('selectors', () => {
  it('selectHouseholdPostTaxAnnual is positive', () => {
    expect(selectHouseholdPostTaxAnnual(appWithKyleAndJacque())).toBeGreaterThan(0);
  });

  it('selectGuiltFreeMonthly is post-tax minus expenses divided by 12', () => {
    const monthly = selectGuiltFreeMonthly(appWithKyleAndJacque());
    expect(monthly).toBeGreaterThan(0);
    expect(monthly).toBeLessThan(selectHouseholdPostTaxAnnual(appWithKyleAndJacque()) / 12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/finance/selectors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/finance/selectors.ts`**

```ts
import type { AppData, MemberId } from '@/types';
import { postTaxIncome, postTaxIncomeShareByMember } from './income';
import { totalExpensesByMember } from './expenses';
import { computeBuckets } from './buckets';

export function selectMemberIds(data: AppData): MemberId[] {
  return data.household.members.map((m) => m.id);
}

export function selectProportionalShares(data: AppData): Record<MemberId, number> {
  return postTaxIncomeShareByMember(
    data.income.byMember,
    data.taxConfig.brackets,
    data.taxConfig.stateFlatRate,
  );
}

export function selectHouseholdPostTaxAnnual(data: AppData): number {
  const ids = selectMemberIds(data);
  let total = 0;
  for (const id of ids) {
    const inc = data.income.byMember[id];
    if (!inc) continue;
    total += postTaxIncome(inc, data.taxConfig.brackets, data.taxConfig.stateFlatRate);
  }
  return total;
}

export function selectExpenseTotalsByMember(data: AppData): Record<MemberId, number> {
  return totalExpensesByMember(
    data.expenses,
    data.household.mode,
    selectProportionalShares(data),
    selectMemberIds(data),
  );
}

export function selectAnnualMinDebtPayments(data: AppData): number {
  return data.debts.reduce((a, d) => a + (d.minMonthlyPayment ?? 0) * 12, 0);
}

export function selectBuckets(data: AppData) {
  return computeBuckets({
    annualPostTaxIncome: selectHouseholdPostTaxAnnual(data),
    expenses: data.expenses,
    goals: data.goals,
    annualMinDebtPayments: selectAnnualMinDebtPayments(data),
    annualPostTaxInvestments: 0, // Plan 4 wires this in via UI
  });
}

export function selectGuiltFreeAnnual(data: AppData): number {
  return selectBuckets(data).guiltFreeAnnual;
}

export function selectGuiltFreeMonthly(data: AppData): number {
  return selectGuiltFreeAnnual(data) / 12;
}

export function selectMarginalEffectiveRates(data: AppData) {
  // Used in Power mode (Plan 4) but exported now for testability.
  const ids = selectMemberIds(data);
  return ids.map((id) => {
    const inc = data.income.byMember[id];
    if (!inc) return null;
    return { memberId: id, filingStatus: inc.filingStatus };
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/finance/selectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/selectors* && git commit -m "feat(finance): add memoizable selectors over AppData"
```

---

## Task 6: useGuiltFree hook

**Files:**

- Create: `src/hooks/useGuiltFree.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useMemo } from 'react';
import { useAppData } from '@/contexts/AppDataProvider';
import {
  selectGuiltFreeMonthly,
  selectGuiltFreeAnnual,
  selectHouseholdPostTaxAnnual,
  selectBuckets,
} from '@/lib/finance/selectors';

export function useGuiltFree() {
  const { appData } = useAppData();
  return useMemo(
    () => ({
      monthly: selectGuiltFreeMonthly(appData),
      annual: selectGuiltFreeAnnual(appData),
      postTaxAnnual: selectHouseholdPostTaxAnnual(appData),
      buckets: selectBuckets(appData),
    }),
    [appData],
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGuiltFree.ts && git commit -m "feat(hooks): add useGuiltFree selector hook"
```

---

## Task 7: formatMoney utility

**Files:**

- Create: `src/utils/formatMoney.ts`
- Test: `src/utils/formatMoney.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/utils/formatMoney.test.ts
import { describe, expect, it } from 'vitest';
import { formatMoney, formatPct } from './formatMoney';

describe('formatMoney', () => {
  it('formats whole dollars with no cents', () => {
    expect(formatMoney(1234)).toBe('$1,234');
  });
  it('formats negatives with parentheses', () => {
    expect(formatMoney(-100)).toBe('($100)');
  });
  it('formats with cents when requested', () => {
    expect(formatMoney(12.5, { cents: true })).toBe('$12.50');
  });
});

describe('formatPct', () => {
  it('formats fraction as percent', () => {
    expect(formatPct(0.62)).toBe('62%');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/utils/formatMoney.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/utils/formatMoney.ts`**

```ts
export function formatMoney(value: number, opts?: { cents?: boolean }): string {
  const cents = opts?.cents ?? false;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return value < 0 ? `($${formatted})` : `$${formatted}`;
}

export function formatPct(fraction: number, decimals = 0): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/utils/formatMoney.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/formatMoney* && git commit -m "feat(utils): add money + percent formatters"
```

---

## Task 8: Income page UI — IncomeForm + page

**Files:**

- Create: `src/components/income/FilingStatusSelector.tsx`, `src/components/income/IncomeForm.tsx`, `src/components/income/PreTaxBreakdown.tsx`
- Modify (rewrite): `src/pages/Income.tsx`

- [ ] **Step 1: Create `src/components/income/FilingStatusSelector.tsx`**

```tsx
import type { FilingStatus } from '@/types';

const OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married — Joint' },
  { value: 'married_separate', label: 'Married — Separate' },
  { value: 'head_of_household', label: 'Head of Household' },
];

export function FilingStatusSelector({
  value,
  onChange,
}: {
  value: FilingStatus;
  onChange: (next: FilingStatus) => void;
}) {
  return (
    <select
      className="rounded border p-2"
      value={value}
      onChange={(e) => onChange(e.target.value as FilingStatus)}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Create `src/components/income/PreTaxBreakdown.tsx`**

```tsx
import type { MemberIncome } from '@/types';
import { preTaxDollars, taxableIncome } from '@/lib/finance/income';
import { formatMoney } from '@/utils/formatMoney';

export function PreTaxBreakdown({ income }: { income: MemberIncome }) {
  return (
    <div className="rounded bg-[var(--color-muted)] p-3 text-sm">
      <div className="flex justify-between">
        <span>Gross salary</span>
        <span>{formatMoney(income.grossAnnualSalary)}</span>
      </div>
      <div className="flex justify-between">
        <span>Pre-tax (401k + HSA)</span>
        <span>−{formatMoney(preTaxDollars(income))}</span>
      </div>
      <div className="mt-1 flex justify-between border-t pt-1 font-medium">
        <span>Taxable</span>
        <span>{formatMoney(taxableIncome(income))}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/income/IncomeForm.tsx`**

```tsx
import { useIncome } from '@/contexts/IncomeProvider';
import { FilingStatusSelector } from './FilingStatusSelector';
import { PreTaxBreakdown } from './PreTaxBreakdown';
import type { Member, MemberIncome } from '@/types';

const EMPTY_INCOME: MemberIncome = {
  grossAnnualSalary: 0,
  payPeriodsPerYear: 26,
  preTax: { contrib401kPct: 0, hsaContribAnnual: 0, rothPct: 0 },
  filingStatus: 'single',
};

export function IncomeForm({ member }: { member: Member }) {
  const { byMember, setMemberIncome } = useIncome();
  const cur = byMember[member.id] ?? EMPTY_INCOME;

  function patch(p: Partial<MemberIncome>) {
    setMemberIncome(member.id, { ...cur, ...p });
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-medium">{member.name}</h3>

      <label className="block">
        <span className="text-sm">Gross annual salary</span>
        <input
          type="number"
          min={0}
          className="mt-1 w-full rounded border p-2"
          value={cur.grossAnnualSalary}
          onChange={(e) => patch({ grossAnnualSalary: Number(e.target.value) })}
        />
      </label>

      <label className="block">
        <span className="text-sm">Pay periods per year</span>
        <input
          type="number"
          min={1}
          max={53}
          className="mt-1 w-full rounded border p-2"
          value={cur.payPeriodsPerYear}
          onChange={(e) => patch({ payPeriodsPerYear: Number(e.target.value) })}
        />
      </label>

      <fieldset className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm">401(k) %</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            className="mt-1 w-full rounded border p-2"
            value={cur.preTax.contrib401kPct}
            onChange={(e) =>
              patch({ preTax: { ...cur.preTax, contrib401kPct: Number(e.target.value) } })
            }
          />
        </label>
        <label className="block">
          <span className="text-sm">HSA $/yr</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded border p-2"
            value={cur.preTax.hsaContribAnnual}
            onChange={(e) =>
              patch({ preTax: { ...cur.preTax, hsaContribAnnual: Number(e.target.value) } })
            }
          />
        </label>
      </fieldset>

      <label className="block">
        <span className="text-sm">Filing status</span>
        <div className="mt-1">
          <FilingStatusSelector
            value={cur.filingStatus}
            onChange={(filingStatus) => patch({ filingStatus })}
          />
        </div>
      </label>

      <PreTaxBreakdown income={cur} />
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `src/pages/Income.tsx`**

```tsx
import { useHousehold } from '@/contexts/HouseholdProvider';
import { IncomeForm } from '@/components/income/IncomeForm';

export function Income() {
  const { household } = useHousehold();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Income</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {household.members.map((m) => (
          <IncomeForm key={m.id} member={m} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/income/ src/pages/Income.tsx && git commit -m "feat(income): per-member income form with pre-tax breakdown"
```

---

## Task 9: Expense table UI

**Files:**

- Create: `src/components/expenses/CategoryPills.tsx`, `src/components/expenses/ExpenseRow.tsx`, `src/components/expenses/AddExpenseDialog.tsx`, `src/components/expenses/ExpenseTable.tsx`, `src/components/expenses/SplitOverrideEditor.tsx`
- Modify (rewrite): `src/pages/Expenses.tsx`

- [ ] **Step 1: Create `src/components/expenses/CategoryPills.tsx`**

```tsx
import type { ExpenseCategory } from '@/types';
import { cn } from '@/lib/utils';

const ALL: ExpenseCategory[] = [
  'essentials',
  'utilities',
  'insurance',
  'subscriptions',
  'estimated',
  'individual',
];

export function CategoryPills({
  value,
  onChange,
}: {
  value: ExpenseCategory;
  onChange: (next: ExpenseCategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ALL.map((cat) => (
        <button
          key={cat}
          type="button"
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs',
            value === cat && 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]',
          )}
          onClick={() => onChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/expenses/SplitOverrideEditor.tsx`**

```tsx
import { useState } from 'react';
import type { Member, MemberId, SplitRule } from '@/types';

export function SplitOverrideEditor({
  members,
  value,
  onChange,
  onClose,
}: {
  members: Member[];
  value: SplitRule | undefined;
  onChange: (next: SplitRule | undefined) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<SplitRule['kind'] | 'default'>(value?.kind ?? 'default');
  const [allocations, setAllocations] = useState<Record<MemberId, number>>(
    value?.kind === 'fixed_pct'
      ? value.allocations
      : Object.fromEntries(members.map((m) => [m.id, 0])),
  );
  const [owner, setOwner] = useState<MemberId>(
    value?.kind === 'individual' ? value.owner : (members[0]?.id ?? ''),
  );

  function commit() {
    if (kind === 'default') return onChange(undefined);
    if (kind === 'proportional') return onChange({ kind: 'proportional' });
    if (kind === 'equal') return onChange({ kind: 'equal' });
    if (kind === 'individual') return onChange({ kind: 'individual', owner });
    if (kind === 'fixed_pct') return onChange({ kind: 'fixed_pct', allocations });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-md space-y-3 bg-white">
        <h3 className="font-medium">Split override</h3>

        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SplitRule['kind'] | 'default')}
          className="w-full rounded border p-2"
        >
          <option value="default">Use household default</option>
          <option value="proportional">Proportional by income</option>
          <option value="equal">Equal split</option>
          <option value="fixed_pct">Custom percentages</option>
          <option value="individual">One person pays all</option>
        </select>

        {kind === 'fixed_pct' && (
          <div className="space-y-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{m.name}</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-24 rounded border p-1 text-right"
                  value={allocations[m.id] ?? 0}
                  onChange={(e) =>
                    setAllocations((p) => ({ ...p, [m.id]: Number(e.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        {kind === 'individual' && (
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded border p-2"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              commit();
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/expenses/ExpenseRow.tsx`**

```tsx
import { useState } from 'react';
import { useExpenses } from '@/contexts/ExpensesProvider';
import { useHousehold } from '@/contexts/HouseholdProvider';
import { CategoryPills } from './CategoryPills';
import { SplitOverrideEditor } from './SplitOverrideEditor';
import { formatMoney } from '@/utils/formatMoney';
import type { Expense } from '@/types';

export function ExpenseRow({ expense }: { expense: Expense }) {
  const { updateExpense, removeExpense } = useExpenses();
  const { household } = useHousehold();
  const [editingSplit, setEditingSplit] = useState(false);

  function patch(p: Partial<Expense>) {
    updateExpense(expense.id, p);
  }

  return (
    <tr className="border-b align-top">
      <td className="p-2">
        <input
          type="text"
          className="w-full rounded border p-1"
          value={expense.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </td>
      <td className="p-2">
        <CategoryPills value={expense.category} onChange={(category) => patch({ category })} />
      </td>
      <td className="p-2">
        <select
          className="rounded border p-1"
          value={expense.cadence}
          onChange={(e) => patch({ cadence: e.target.value as Expense['cadence'] })}
        >
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
        </select>
      </td>
      <td className="p-2 text-right">
        <input
          type="number"
          min={0}
          className="w-28 rounded border p-1 text-right"
          value={expense.amount}
          onChange={(e) => patch({ amount: Number(e.target.value) })}
        />
      </td>
      <td className="p-2">
        <select
          className="rounded border p-1"
          value={expense.paidBy ?? ''}
          onChange={(e) => patch({ paidBy: e.target.value || undefined })}
        >
          <option value="">—</option>
          {household.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <button
          type="button"
          className="btn btn-ghost border"
          onClick={() => setEditingSplit(true)}
        >
          {expense.splitOverride ? expense.splitOverride.kind : 'default'}
        </button>
        {editingSplit && (
          <SplitOverrideEditor
            members={household.members}
            value={expense.splitOverride}
            onChange={(next) => patch({ splitOverride: next })}
            onClose={() => setEditingSplit(false)}
          />
        )}
      </td>
      <td className="p-2 text-right text-sm text-[var(--color-muted-fg)]">
        {formatMoney(expense.cadence === 'monthly' ? expense.amount * 12 : expense.amount)}/yr
      </td>
      <td className="p-2">
        <button
          type="button"
          className="btn btn-ghost text-[var(--color-danger)]"
          aria-label="Remove expense"
          onClick={() => removeExpense(expense.id)}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Create `src/components/expenses/AddExpenseDialog.tsx`**

```tsx
import { useState } from 'react';
import { useExpenses } from '@/contexts/ExpensesProvider';
import { newId } from '@/utils/ids';
import { CategoryPills } from './CategoryPills';
import type { Cadence, ExpenseCategory } from '@/types';

export function AddExpenseDialog({ onClose }: { onClose: () => void }) {
  const { addExpense } = useExpenses();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('essentials');
  const [cadence, setCadence] = useState<Cadence>('annual');
  const [amount, setAmount] = useState(0);

  function submit() {
    if (!name.trim()) return;
    addExpense({ id: newId(), name: name.trim(), category, cadence, amount });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-md space-y-3 bg-white">
        <h3 className="font-medium">Add expense</h3>
        <input
          autoFocus
          type="text"
          className="w-full rounded border p-2"
          placeholder="Name (e.g., Rent)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <CategoryPills value={category} onChange={setCategory} />
        <div className="flex gap-2">
          <select
            className="rounded border p-2"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
          >
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            type="number"
            min={0}
            className="flex-1 rounded border p-2"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/expenses/ExpenseTable.tsx`**

```tsx
import { useState } from 'react';
import { useExpenses } from '@/contexts/ExpensesProvider';
import { ExpenseRow } from './ExpenseRow';
import { AddExpenseDialog } from './AddExpenseDialog';

export function ExpenseTable() {
  const { expenses } = useExpenses();
  const [adding, setAdding] = useState(false);

  return (
    <div className="card overflow-x-auto">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Expenses</h2>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Add expense
        </button>
      </div>
      <table className="min-w-full text-left text-sm">
        <thead className="border-b">
          <tr>
            <th className="p-2">Name</th>
            <th className="p-2">Category</th>
            <th className="p-2">Cadence</th>
            <th className="p-2 text-right">Amount</th>
            <th className="p-2">Paid by</th>
            <th className="p-2">Split</th>
            <th className="p-2 text-right">Annualized</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} />
          ))}
          {expenses.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4 text-center text-[var(--color-muted-fg)]">
                No expenses yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {adding && <AddExpenseDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `src/pages/Expenses.tsx`**

```tsx
import { ExpenseTable } from '@/components/expenses/ExpenseTable';

export function Expenses() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <ExpenseTable />
    </div>
  );
}
```

- [ ] **Step 7: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/expenses/ src/pages/Expenses.tsx && git commit -m "feat(expenses): table editor with split override + paidBy"
```

---

## Task 10: Tax page UI

**Files:**

- Create: `src/components/tax/BracketEditor.tsx`, `src/components/tax/TaxSummaryCard.tsx`
- Modify (rewrite): `src/pages/TaxCalculator.tsx`

- [ ] **Step 1: Create `src/components/tax/BracketEditor.tsx`**

```tsx
import { useTax } from '@/contexts/TaxProvider';
import type { FilingStatus, TaxBracket } from '@/types';
import { formatMoney } from '@/utils/formatMoney';
import { DEFAULT_BRACKETS_2026 } from '@/schemas';

export function BracketEditor({ filingStatus }: { filingStatus: FilingStatus }) {
  const { taxConfig, setTaxConfig } = useTax();
  const tiers = taxConfig.brackets[filingStatus];

  function update(idx: number, patch: Partial<TaxBracket>) {
    const next = tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setTaxConfig({
      ...taxConfig,
      brackets: { ...taxConfig.brackets, [filingStatus]: next },
    });
  }

  function reset() {
    setTaxConfig({
      ...taxConfig,
      brackets: { ...taxConfig.brackets, [filingStatus]: DEFAULT_BRACKETS_2026[filingStatus] },
    });
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium capitalize">{filingStatus.replace('_', ' ')}</h3>
        <button type="button" className="btn btn-ghost text-xs" onClick={reset}>
          Reset to default
        </button>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="p-1">Up to</th>
            <th className="p-1">Rate</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i} className="border-b">
              <td className="p-1">
                <input
                  type="number"
                  min={0}
                  className="w-32 rounded border p-1 text-right"
                  value={t.upTo ?? ''}
                  placeholder="∞"
                  onChange={(e) =>
                    update(i, { upTo: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
                <span className="ml-1 text-xs text-[var(--color-muted-fg)]">
                  {t.upTo !== null && formatMoney(t.upTo)}
                </span>
              </td>
              <td className="p-1">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-20 rounded border p-1 text-right"
                  value={t.rate}
                  onChange={(e) => update(i, { rate: Number(e.target.value) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/tax/TaxSummaryCard.tsx`**

```tsx
import { useAppData } from '@/contexts/AppDataProvider';
import { selectHouseholdPostTaxAnnual } from '@/lib/finance/selectors';
import { totalGrossIncomeForHousehold } from '@/lib/finance/income';
import { formatMoney } from '@/utils/formatMoney';

export function TaxSummaryCard() {
  const { appData } = useAppData();
  const gross = totalGrossIncomeForHousehold(appData.income.byMember);
  const post = selectHouseholdPostTaxAnnual(appData);
  const totalTax = Math.max(0, gross - post);

  return (
    <div className="card grid grid-cols-3 gap-4 text-sm">
      <div>
        <div className="text-[var(--color-muted-fg)]">Household gross</div>
        <div className="text-lg font-semibold">{formatMoney(gross)}</div>
      </div>
      <div>
        <div className="text-[var(--color-muted-fg)]">Estimated tax</div>
        <div className="text-lg font-semibold">{formatMoney(totalTax)}</div>
      </div>
      <div>
        <div className="text-[var(--color-muted-fg)]">Post-tax</div>
        <div className="text-lg font-semibold">{formatMoney(post)}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `src/pages/TaxCalculator.tsx`**

```tsx
import { useTax } from '@/contexts/TaxProvider';
import { BracketEditor } from '@/components/tax/BracketEditor';
import { TaxSummaryCard } from '@/components/tax/TaxSummaryCard';
import type { FilingStatus } from '@/types';

const FILINGS: FilingStatus[] = [
  'single',
  'married_joint',
  'married_separate',
  'head_of_household',
];

export function TaxCalculator() {
  const { taxConfig, setTaxConfig } = useTax();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tax Calculator</h1>

      <TaxSummaryCard />

      <div className="card flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Year
          <input
            type="number"
            className="w-24 rounded border p-1"
            value={taxConfig.year}
            onChange={(e) => setTaxConfig({ ...taxConfig, year: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          State
          <input
            type="text"
            className="w-20 rounded border p-1"
            value={taxConfig.state ?? ''}
            placeholder="(optional)"
            onChange={(e) => setTaxConfig({ ...taxConfig, state: e.target.value || undefined })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          State flat rate
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            className="w-24 rounded border p-1"
            value={taxConfig.stateFlatRate ?? 0}
            onChange={(e) =>
              setTaxConfig({
                ...taxConfig,
                stateFlatRate: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {FILINGS.map((fs) => (
          <BracketEditor key={fs} filingStatus={fs} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tax/ src/pages/TaxCalculator.tsx && git commit -m "feat(tax): bracket editor + summary card"
```

---

## Task 11: Dashboard — GuiltFreeCard, BucketBreakdown, AlertList

**Files:**

- Create: `src/components/dashboard/GuiltFreeCard.tsx`, `src/components/dashboard/BucketBreakdown.tsx`, `src/components/dashboard/AlertList.tsx`, `src/components/dashboard/IncomeOverviewCard.tsx`, `src/components/dashboard/ExpenseOverviewCard.tsx`
- Modify (rewrite): `src/pages/Dashboard.tsx`

- [ ] **Step 1: Create `src/components/dashboard/GuiltFreeCard.tsx`**

```tsx
import { useGuiltFree } from '@/hooks/useGuiltFree';
import { formatMoney } from '@/utils/formatMoney';
import { cn } from '@/lib/utils';

export function GuiltFreeCard() {
  const { monthly, annual } = useGuiltFree();
  const negative = monthly < 0;

  return (
    <div className="card">
      <div className="text-sm text-[var(--color-muted-fg)]">Guilt-Free Money</div>
      <div className={cn('text-4xl font-semibold', negative && 'text-[var(--color-danger)]')}>
        {formatMoney(monthly)}/mo
      </div>
      <div className="text-sm text-[var(--color-muted-fg)]">
        {formatMoney(annual)}/yr after fixed costs, savings, and investments
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/dashboard/BucketBreakdown.tsx`**

```tsx
import { useGuiltFree } from '@/hooks/useGuiltFree';
import { formatMoney, formatPct } from '@/utils/formatMoney';
import { cn } from '@/lib/utils';

function StatusPill({ value, target }: { value: number; target: { min: number; max: number } }) {
  let color = 'bg-[var(--color-success)] text-white';
  if (value < target.min - 0.05 || value > target.max + 0.05) {
    color = 'bg-[var(--color-danger)] text-white';
  } else if (value < target.min || value > target.max) {
    color = 'bg-[var(--color-warning)] text-black';
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs', color)}>
      target {formatPct(target.min)}–{formatPct(target.max)}
    </span>
  );
}

export function BucketBreakdown() {
  const { buckets } = useGuiltFree();

  const rows = [
    {
      label: 'Fixed Costs',
      value: buckets.fixedCostsAnnual,
      pct: buckets.fixedCostsPct,
      target: buckets.targets.fixedCosts,
    },
    {
      label: 'Investments',
      value: buckets.investmentsAnnual,
      pct: buckets.investmentsPct,
      target: buckets.targets.investments,
    },
    {
      label: 'Savings Goals',
      value: buckets.savingsAnnual,
      pct: buckets.savingsPct,
      target: buckets.targets.savings,
    },
    {
      label: 'Guilt-Free',
      value: buckets.guiltFreeAnnual,
      pct: buckets.guiltFreePct,
      target: buckets.targets.guiltFree,
    },
  ];

  return (
    <div className="card">
      <h2 className="mb-2 font-medium">Conscious Spending Plan</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-b-0">
              <td className="py-2">{r.label}</td>
              <td className="py-2 text-right">{formatMoney(r.value)}</td>
              <td className="py-2 text-right">{formatPct(r.pct)}</td>
              <td className="py-2 text-right">
                <StatusPill value={r.pct} target={r.target} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/dashboard/AlertList.tsx`**

```tsx
import { useAppData } from '@/contexts/AppDataProvider';
import { useGuiltFree } from '@/hooks/useGuiltFree';

interface Alert {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export function AlertList() {
  const { appData } = useAppData();
  const { monthly, postTaxAnnual } = useGuiltFree();

  const alerts: Alert[] = [];
  if (monthly < 0) {
    alerts.push({ level: 'error', message: "You're spending more than you make this year." });
  }
  if (Object.keys(appData.income.byMember).length === 0) {
    alerts.push({ level: 'warn', message: 'No income entered yet — head to Income to add it.' });
  }
  if (postTaxAnnual === 0 && Object.keys(appData.income.byMember).length > 0) {
    alerts.push({ level: 'warn', message: 'Post-tax income is zero. Check pre-tax % and salary.' });
  }
  if (appData.expenses.length === 0) {
    alerts.push({ level: 'info', message: 'Add expenses to see your Guilt-Free number.' });
  }

  if (alerts.length === 0) return null;

  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li
          key={i}
          className={
            a.level === 'error'
              ? 'card border-l-4 border-[var(--color-danger)]'
              : a.level === 'warn'
                ? 'card border-l-4 border-[var(--color-warning)]'
                : 'card border-l-4 border-[var(--color-primary)]'
          }
        >
          {a.message}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Create `src/components/dashboard/IncomeOverviewCard.tsx`**

```tsx
import { useAppData } from '@/contexts/AppDataProvider';
import { totalGrossIncomeForHousehold } from '@/lib/finance/income';
import { selectHouseholdPostTaxAnnual } from '@/lib/finance/selectors';
import { formatMoney } from '@/utils/formatMoney';

export function IncomeOverviewCard() {
  const { appData } = useAppData();
  const gross = totalGrossIncomeForHousehold(appData.income.byMember);
  const post = selectHouseholdPostTaxAnnual(appData);
  return (
    <div className="card">
      <div className="text-sm text-[var(--color-muted-fg)]">Household Income</div>
      <div className="text-2xl font-semibold">{formatMoney(gross)}/yr gross</div>
      <div className="text-sm text-[var(--color-muted-fg)]">{formatMoney(post)}/yr post-tax</div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/dashboard/ExpenseOverviewCard.tsx`**

```tsx
import { useAppData } from '@/contexts/AppDataProvider';
import { toAnnual } from '@/lib/finance/expenses';
import { formatMoney } from '@/utils/formatMoney';

export function ExpenseOverviewCard() {
  const { appData } = useAppData();
  const totalAnnual = appData.expenses.reduce((a, e) => a + toAnnual(e), 0);
  return (
    <div className="card">
      <div className="text-sm text-[var(--color-muted-fg)]">Total Expenses</div>
      <div className="text-2xl font-semibold">{formatMoney(totalAnnual)}/yr</div>
      <div className="text-sm text-[var(--color-muted-fg)]">{formatMoney(totalAnnual / 12)}/mo</div>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `src/pages/Dashboard.tsx`**

```tsx
import { GuiltFreeCard } from '@/components/dashboard/GuiltFreeCard';
import { BucketBreakdown } from '@/components/dashboard/BucketBreakdown';
import { AlertList } from '@/components/dashboard/AlertList';
import { IncomeOverviewCard } from '@/components/dashboard/IncomeOverviewCard';
import { ExpenseOverviewCard } from '@/components/dashboard/ExpenseOverviewCard';

export function Dashboard() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <AlertList />
      <div className="grid gap-4 md:grid-cols-3">
        <GuiltFreeCard />
        <IncomeOverviewCard />
        <ExpenseOverviewCard />
      </div>
      <BucketBreakdown />
    </div>
  );
}
```

- [ ] **Step 7: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/ src/pages/Dashboard.tsx && git commit -m "feat(dashboard): guilt-free card, bucket breakdown, alerts"
```

---

## Task 12: E2E flow — setup → income → expenses → guilt-free shown

**Files:**

- Create: `tests/flows.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/flows.spec.ts
import { test, expect } from '@playwright/test';

test('setup → income → expenses → dashboard shows guilt-free', async ({ page }) => {
  await page.goto('/');

  // 1. Setup
  await page.getByPlaceholder('e.g., The Smiths').fill('Test');
  await page.getByPlaceholder('Add a name').fill('Alex');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByPlaceholder('Add a name').fill('Jamie');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();

  // 2. Income
  await page.getByRole('link', { name: 'Income' }).click();
  const salaryInputs = page.getByLabel('Gross annual salary');
  await salaryInputs.first().fill('100000');
  await salaryInputs.nth(1).fill('80000');

  // 3. Expense
  await page.getByRole('link', { name: 'Expenses' }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByPlaceholder('Name (e.g., Rent)').fill('Rent');
  await page.getByPlaceholder('Amount').fill('24000');
  await page.getByRole('button', { name: 'Add' }).last().click();

  // 4. Dashboard shows positive guilt-free
  await page.getByRole('link', { name: 'Dashboard' }).click();
  const card = page.getByText('Guilt-Free Money');
  await expect(card).toBeVisible();
  // Look for $ followed by a digit (positive) — not "($X)"
  await expect(page.locator('text=/\\$[0-9]/').first()).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

Run: `npm run test:e2e`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/flows.spec.ts && git commit -m "test(e2e): full setup → income → expenses → dashboard flow"
```

---

## Task 13: Final gate

- [ ] **Step 1: Run full quality gate**

Run: `npm run typecheck && npm run lint && npm test -- --run && npm run test:e2e`
Expected: all green.

- [ ] **Step 2: Tag**

```bash
git tag plan-2-headline && echo "Plan 2 complete"
```

---

## Self-Review

- **Spec coverage:** §5 computation pipeline ✓ Tasks 1–5. §3 Income/Expenses/Tax/Dashboard pages ✓ Tasks 8–11. Bucket targets + status pills ✓ Task 11. Edge cases (zero-income, missing paidBy, negative guilt-free) ✓ Tasks 2, 11.
- **Placeholders:** none.
- **Type consistency:** `MemberIncome`, `Expense`, `SplitRule`, `TaxBrackets` all match Plan 1 Task 7. Selector return types align with hook usage.
