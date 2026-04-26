# Group Finance App — Design

**Date:** 2026-04-25
**Status:** Design approved (pending user written-spec review)
**Audience:** Implementation team / future Claude sessions

---

## 1. Problem & Goals

A finance app for individuals or small groups (couples, roommates) to manage income, expenses, taxes, assets, debt, and goals — and answer the headline question: **"How much can I freely spend this month, without revisiting things every single month?"**

Replaces a sophisticated 6-tab Excel workbook (`groupfinanceapp.xlsx`) the user already maintains. Data entry stays simple; depth is unlocked via a global **Simple ⇄ Power** mode toggle that progressively reveals more analysis on every page.

### Audience

Mixed: average users who want a simple "this is what you can spend" number, and financially literate users who want the depth of a hand-rolled spreadsheet (tax-aware pre-tax/HSA optimization, asset class %, emergency liquidity in months-of-living).

### Non-goals (v1)

- No multi-user / no cloud sync — single device, single browser
- No live bank/Plaid integration
- No mobile-native apps — responsive web only
- No transaction-level ledger — values are amounts (annual or monthly), not individual purchases

---

## 2. Architecture

### Stack (mirrors `D:\ClaudeCode\table-planner2`)

- **Framework:** React 19 + TypeScript + Vite 8
- **UI:** Tailwind CSS 4 + shadcn/ui (Radix primitives)
- **Routing:** React Router 7
- **Persistence:** `localStorage` only — 100% client-side, no backend, no auth
- **Validation:** Zod 4 at every import/load boundary
- **Imports/exports:** `papaparse` (CSV), `exceljs` (xlsx)
- **Charts:** `recharts`
- **Testing:** Vitest 4 (jsdom) + Playwright

### Persistence pattern (copied verbatim from table-planner2)

- One `AppDataProvider` is the **only** writer to localStorage
- Slice providers push updates up via `updateXxxSlice` callbacks
- 300ms debounced single-write path; `safeLocalStorage` wrapper with 5MB cap
- Centralized `storageKeys.ts`; versioned `migrations.ts`
- `dataVersion` counter for re-init signals

### App shell

- Sidebar nav (collapsible on mobile) + top bar
- Top bar: workspace name, **Simple ⇄ Power** toggle, "last saved" indicator
- Auto-snapshot job on app load if last snapshot > `settings.snapshotIntervalDays` (default 30)

---

## 3. Pages & Navigation

| Page                         | Purpose                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Setup wizard** (first-run) | Configure household name, mode (Couples / Roommates), members             |
| **Dashboard**                | Headline view — Guilt-Free $, monthly cashflow, goal progress, alerts     |
| **Income**                   | Per-person: gross, pay periods, bonuses, pre-tax (401k %, HSA $, ROTH %)  |
| **Expenses**                 | Annual/monthly amounts, category, `paidBy`, per-line split override       |
| **Tax Calculator**           | Filing status, federal brackets, optional state, contribution-limit check |
| **Assets**                   | Snapshots of cash, brokerage, retirement, crypto, HSA — by owner          |
| **Debt**                     | Credit cards, loans, asset loans — balances + min payment                 |
| **Goals**                    | Targets (wedding, house, emergency fund) with allocated $ + target date   |
| **Settings**                 | Mode toggle, snapshot history, import/export, reset, theme                |

**Routing:** React Router 7. First-run guard redirects to `/setup` if no household configured. There is **no** dedicated PowerAnalysis page — Power mode is a progressive disclosure layer on every summary view.

---

## 4. Data Model

```typescript
interface AppData {
  version: string;
  lastModified: number;
  household: Household;
  income: Income;
  expenses: Expense[];
  taxConfig: TaxConfig;
  assets: Asset[];
  debts: Debt[];
  goals: Goal[];
  snapshots: Snapshot[]; // append-only history
  settings: AppSettings;
}

interface Household {
  name: string;
  mode: 'couples' | 'roommates';
  members: Member[]; // 1..n; 1 = solo use
}

interface Member {
  id: string;
  name: string;
  color?: string;
}

interface Income {
  byMember: Record<MemberId, MemberIncome>;
}

interface MemberIncome {
  grossAnnualSalary: number;
  payPeriodsPerYear: number;
  expectedBonus?: number;
  expectedStock?: number;
  preTax: {
    contrib401kPct: number; // 0.0–1.0
    hsaContribAnnual: number;
    rothPct: number;
  };
  filingStatus: 'single' | 'married_joint' | 'married_separate' | 'head_of_household';
}

interface Expense {
  id: string;
  name: string;
  category: 'essentials' | 'utilities' | 'insurance' | 'subscriptions' | 'estimated' | 'individual';
  cadence: 'annual' | 'monthly';
  amount: number;
  paidBy?: MemberId;
  splitOverride?: SplitRule;
}

type SplitRule =
  | { kind: 'proportional' }
  | { kind: 'equal' }
  | { kind: 'fixed_pct'; allocations: Record<MemberId, number> }
  | { kind: 'individual'; owner: MemberId };

interface TaxConfig {
  year: number;
  state?: string;
  brackets: TaxBrackets; // ships with current-year defaults; user-editable
}

interface Asset {
  id: string;
  name: string;
  type: 'cash' | 'crypto' | 'investment' | 'retirement' | 'hsa';
  balance: number;
  owner?: MemberId; // null = joint
  asOf: number;
}

interface Debt {
  id: string;
  name: string;
  type: 'credit_card' | 'loan' | 'asset_loan';
  balance: number;
  minMonthlyPayment?: number;
  interestRate?: number;
  owner?: MemberId;
  asOf: number;
}

interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  allocated: number;
  targetDate?: number;
  monthlyContribution?: number;
}

interface Snapshot {
  date: number;
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  monthlyGuiltFree: number;
  goalProgress: Record<GoalId, number>;
}
```

### Invariants

- Members 1+ (solo = household-of-1)
- `splitOverride` always wins; absent → household mode default applies
- `Snapshot[]` is append-only; never mutated through normal use; Settings has a "trim" option
- `taxConfig.brackets` ships with current-year IRS defaults but is fully editable
- `proportional` splits dynamically recompute from current incomes — splits are derived, not stored

---

## 5. Computation Engine

All math lives in `src/lib/finance/` — pure functions, no React, fully testable. Components consume via memoized selectors.

### Pipeline

```
Inputs (AppData)
  ├─ deriveTaxableIncome(member)
  │   = grossSalary − preTax.401k$ − hsa$ − (other pre-tax line items)
  ├─ estimateFederalTax(taxableIncome, filingStatus, brackets)
  │   joint households sum + apply joint brackets
  ├─ estimateStateTax(taxableIncome, state)        // optional
  ├─ postTaxIncome(member) = taxableIncome − federalTax − stateTax
  ├─ allocateExpenses(expenses, household, income)
  │   for each expense:
  │     rule = expense.splitOverride ?? householdDefaultRule
  │     proportional → by post-tax income share
  │     equal        → 1/N
  │     fixed_pct    → stored allocations
  │     individual   → 100% to owner
  ├─ goalContributions(goals)
  ├─ investmentContributions(income)               // post-tax investing
  └─ guiltFreeMoney(member|household) =
       postTaxIncome − allocatedFixedCosts − goalContrib − investmentContrib
```

### Ramit-aligned bucket presentation (Simple-mode dashboard)

```
Fixed Costs (target 50–60%)  = essentials + utilities + insurance + min debt payments
Investments (target 10%)     = post-tax investing + 401k post-tax
Savings Goals (target 5–10%) = sum of goal monthly contributions
Guilt-Free (target 20–35%)   = remainder
```

Targets render as soft status pills (green/amber/red) — informational, not enforced.

### Edge cases

- Solo household (1 member): all "splits" trivially 100%; proportional == equal
- Zero-income member: proportional split falls back to equal to avoid divide-by-zero
- Missing `paidBy`: allocation still computed; `paidBy` only affects reimbursement reports
- Negative guilt-free $: rendered red on dashboard with "you're spending more than you make" callout

---

## 6. Power Mode (Progressive Disclosure)

Power mode is **not** a separate page. Every summary component reads `analysisMode` from `UIStateContext` and renders extra detail blocks inline.

| Page          | Power mode adds                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard** | Bucket %s with target deltas, marginal tax rate, savings rate, runway months, "if you maxed pre-tax you'd save $X" card                          |
| **Income**    | Pay-period breakdown, joint vs separate filing comparison, `paidBy` % share table, marginal bracket landed in                                    |
| **Expenses**  | YoY drift from snapshots, % of post-tax income per category, fixed vs discretionary split, top 5 expenses, per-member burden                     |
| **Tax**       | Bracket-by-bracket fill chart, contribution-limit check, unused pre-tax room, max-savings hint, effective vs marginal rate                       |
| **Assets**    | Asset-class % breakdown, low/high range scenarios (crypto ±50%, investments −30%/+5%), emergency-liquidity months, joint vs individual ownership |
| **Debt**      | Months-to-payoff at current servicing, interest-cost projection, debt-to-income ratio, avalanche vs snowball comparison                          |
| **Goals**     | Required monthly contribution to hit target date, % of post-tax income committed to goals, projected completion date at current pace             |

### Pattern

```typescript
function ExpenseSummary() {
  const { analysisMode } = useUIState();
  return (
    <Card>
      <SimpleExpenseView />
      {analysisMode === 'power' && <PowerExpenseDetails />}
    </Card>
  );
}
```

Each section folder gets a `power/` sibling containing blocks mounted only when mode is `power`.

---

## 7. Provider Hierarchy

```
TooltipProvider
  AppDataProvider              ← single source of truth
    ThemeProvider
      HouseholdProvider
        IncomeProvider
          ExpensesProvider
            TaxProvider
              AssetsProvider
                DebtsProvider
                  GoalsProvider
                    SnapshotsProvider
                      UIStateProvider
```

- Each provider has setters that call `updateXxxSlice(next)`
- `AppDataProvider` merges slices, debounces 300ms, writes once
- `useFinance()` unified hook spreads `Household`, `Income`, `Expenses`, `UIState` (most-used)
- Other contexts imported directly to avoid bloating the unified hook
- Generic `useEntityReducer` (from table-planner2) for `expenses`, `assets`, `debts`, `goals`
- Plain `useState` for non-list state (`Household`, `Income`)
- React 19 compiler enabled; no manual memoization fights (table-planner2 invariant #12)

---

## 8. Import / Export / Bootstrap

### Bootstrap from existing xlsx (one-shot first-run option)

`src/services/xlsxImportService.ts` — pure (`{ data, errors }`), uses `exceljs`, fuzzy header matching:

| Workbook tab                         | Maps to                                         |
| ------------------------------------ | ----------------------------------------------- |
| `Planning \| Intro` (Step 1, Step 2) | `Income.byMember[*]`                            |
| `Planning \| Expenses`               | `Expense[]` (cadence: annual, paidBy populated) |
| `Planning \| State of Assets`        | `Asset[]` (type derived from section)           |
| `Planning \| State of Debt`          | `Debt[]`                                        |
| `Goals`                              | `Goal[]`                                        |
| `Tax Calculator`                     | `TaxConfig.brackets` (if customized)            |

### Ongoing imports

- **CSV transactions** (`papaparse`): drop a bank/CC CSV → suggested expense category & sums; user reviews before persisting
- **xlsx re-import:** _destructive replace_ with confirmation modal (per table-planner2 invariant #10)

### Exports

- **Full xlsx workbook** — roundtrip-able; users can edit in Excel and re-import
- **CSV per section**
- **JSON of `AppData`** for backup / device transfer

### Validation

All imports pass through Zod schemas at the parse boundary (`src/schemas/`). Errors collected and presented in a review modal before commit.

---

## 9. File Structure

```
src/
  App.tsx, main.tsx, index.css
  pages/
    Setup.tsx, Dashboard.tsx, Income.tsx, Expenses.tsx,
    TaxCalculator.tsx, Assets.tsx, Debt.tsx, Goals.tsx, Settings.tsx
  components/
    common/                 layout shell, sidebar, top bar, modals
    income/                 IncomeForm, PreTaxBreakdown, FilingStatusSelector
    expenses/               ExpenseTable, SplitOverrideEditor, CategoryPills
    tax/                    BracketEditor, TaxSavingsCard
    assets/                 AssetTable
    debt/                   DebtTable
    goals/                  GoalCard, GoalProgressBar, AllocationDialog
    dashboard/              GuiltFreeCard, BucketBreakdown, AlertList
    {section}/power/        Power-mode-only blocks per section
  contexts/                 (one provider file per slice; see §7)
  hooks/
    useFinance.ts
    useEntityReducer.ts     copied from table-planner2
  lib/
    finance/
      tax.ts, income.ts, expenses.ts, buckets.ts, power.ts, selectors.ts
    safeStorage.ts          copied from table-planner2
    storageKeys.ts
  schemas/                  Zod schemas mirroring data model
  services/
    DataRepository.ts       only writer of localStorage
    xlsxImportService.ts    pure
    csvImportService.ts     pure
    exportService.ts
  utils/
    migrations.ts
    formatMoney.ts
    snapshotJob.ts
  types/index.ts
  test/                     vitest setup
tests/                      Playwright E2E
docs/
  invariants.md             same style as table-planner2
  architecture.md
```

---

## 10. Testing Strategy

### Vitest (unit + integration)

- `src/lib/finance/**` — every formula has a test, including edge cases (zero-income member, single-member household, missing paidBy, negative guilt-free)
- `xlsxImportService.test.ts` — parses an anonymized fixture of the user's real workbook end-to-end; verifies fuzzy header matching against header variants
- `csvImportService.test.ts` — common bank CSV header variants
- Provider tests — slice updates flow correctly to `AppData`; debounced save coalesces multi-rapid edits
- Migration tests — every version step has a fixture in/out

### Playwright (E2E)

- First-run wizard → import xlsx → dashboard with correct headline numbers
- Couples: change Kyle's salary → Jacque's expense allocation auto-recomputes
- Roommates toggle → same expenses now split equally
- Per-line override: "Internet → Kyle 100%" → allocation updates
- Snapshot job: stub clock, advance 31 days, reload → new snapshot appended
- Power-mode toggle: each summary page shows additional blocks with correct numbers
- Export → Import roundtrip: export xlsx, clear localStorage, re-import → identical state

### Quality gates

- ESLint baseline: 0 errors / 0 warnings
- React Compiler enabled; no "Compilation Skipped" warnings
- TypeScript: `tsc --noEmit -p tsconfig.app.json` strict, gate to merge

---

## 11. Open Questions (Deferred to Implementation)

- **Tax brackets seed data:** ship 2026 federal + a curated set of common state brackets (CA, NY, TX, MA, FL, …) or just federal + free-form state rate field? Decide before the Tax page lands.
- **CSV column-mapping UX:** auto-detect with a review modal, or always show a mapping step? Lean auto-detect with override.
- **Theme:** start with table-planner2's HSL theme system or simpler 2–3 preset themes? Lean simpler — finance app doesn't need 7 themes.
- **Snapshot density:** monthly default; setting allows weekly. Confirm during build.
- **Migration from xlsx → app:** decide whether the importer is destructive-replace only, or whether re-importing later can be a _merge_ (keep snapshots, replace inputs).

---

## 12. Repo Hygiene & .gitignore

The user's reference workbook and other dev-only artifacts must **never** ship to production. The implementation plan adds these to `.gitignore` in the very first task:

```
# User reference data (NOT for production)
groupfinanceapp.xlsx
*.xlsx                          # all xlsx files at repo root — fixtures live in tests/fixtures/
fixtures/anonymized-*.xlsx      # except anonymized test fixtures (explicit allow below)

# Brainstorm artifacts (kept locally only)
.superpowers/

# Build & deps
node_modules/
dist/
build/
.vite/

# Test artifacts
test-results/
playwright-report/
playwright/.cache/
coverage/

# Editor / OS
.DS_Store
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
*.swp

# Env
.env
.env.local
.env.*.local
```

**Allow-list exception:** anonymized fixture xlsx files for `xlsxImportService.test.ts` live at `tests/fixtures/` and are explicitly checked in. The original `groupfinanceapp.xlsx` is never committed — it stays at the repo root for the developer to import via the first-run wizard.

Production build (`npm run build`) outputs to `dist/` and contains zero references to the reference workbook.

---

## 13. Build Strategy

**Phase 1 — Local v1 (this spec):** ship the entire 9-section app locally. 100% client-side, localStorage. Single device. Sufficient for the user's own household.

**Phase 2 (deferred, not in this spec):** iterate based on real usage. Likely candidates: cloud sync, mobile-native, transaction-level ledger, Plaid. Each becomes its own design doc when prioritized.

---

## 14. References

- Existing source-of-truth workbook: `D:\ClaudeCode\GroupFinanceApp\groupfinanceapp.xlsx` (gitignored)
- Architecture baseline: `D:\ClaudeCode\table-planner2\` — especially `docs/architecture.md`, `docs/invariants.md`
- Conscious Spending Plan: Ramit Sethi, _I Will Teach You to Be Rich_ (Fixed Costs / Investments / Savings / Guilt-Free)
