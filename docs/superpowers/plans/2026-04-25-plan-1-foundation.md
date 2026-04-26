# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the React 19 / Vite / TS / Tailwind project, persistence layer, provider hierarchy, app shell, first-run setup wizard, and empty routed pages so subsequent plans can plug in features.

**Architecture:** Mirror `D:\ClaudeCode\table-planner2` exactly — 100% client-side, single debounced write path through `AppDataProvider`, slice providers push updates up via callbacks, all I/O goes through `safeLocalStorage`, Zod validates at every load/import boundary.

**Tech Stack:** React 19, TypeScript 6, Vite 8 (rolldown + oxc), Tailwind CSS 4, shadcn/ui (Radix), React Router 7, Zod 4, Vitest 4 (jsdom), Playwright, ESLint 10, Prettier 3.

---

## File Structure

```
GroupFinanceApp/
  .gitignore
  .prettierrc.json
  .prettierignore
  components.json                 shadcn/ui registry config
  eslint.config.js
  index.html
  package.json
  playwright.config.ts
  postcss.config.js
  tsconfig.app.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  vitest.config.ts
  docs/
    architecture.md
    invariants.md
  public/
    favicon.svg
  src/
    App.tsx
    main.tsx
    index.css
    types/
      index.ts                    AppData + all domain types
    schemas/
      index.ts                    Zod mirrors of types/index.ts
    lib/
      storageKeys.ts
      safeStorage.ts
      utils.ts                    cn() helper for tailwind class merge
    services/
      DataRepository.ts           the only writer of localStorage
    utils/
      migrations.ts
      ids.ts                      uuid wrapper
    hooks/
      useEntityReducer.ts
      useFinance.ts
    contexts/
      AppDataProvider.tsx
      HouseholdProvider.tsx
      IncomeProvider.tsx
      ExpensesProvider.tsx
      TaxProvider.tsx
      AssetsProvider.tsx
      DebtsProvider.tsx
      GoalsProvider.tsx
      SnapshotsProvider.tsx
      UIStateProvider.tsx
    components/
      common/
        AppShell.tsx
        Sidebar.tsx
        TopBar.tsx
        ModeToggle.tsx
        FirstRunGuard.tsx
        ui/                       shadcn/ui generated components
    pages/
      Setup.tsx
      Dashboard.tsx
      Income.tsx
      Expenses.tsx
      TaxCalculator.tsx
      Assets.tsx
      Debt.tsx
      Goals.tsx
      Settings.tsx
    test/
      setup.ts
  tests/
    smoke.spec.ts                 Playwright smoke test
    fixtures/
      .gitkeep
```

---

## Task 1: Initialize project & install dependencies

**Files:**

- Create: `package.json`, `index.html`, `public/favicon.svg`, `.gitignore`

- [ ] **Step 1: Run `npm init -y` to scaffold package.json**

```bash
cd D:/ClaudeCode/GroupFinanceApp && npm init -y
```

- [ ] **Step 2: Replace `package.json` with the project version**

Create `package.json`:

```json
{
  "name": "group-finance-app",
  "version": "0.1.0",
  "description": "Group Finance App — local-first cashflow + guilt-free spending tracker for individuals, couples, and roommates.",
  "license": "MIT",
  "author": "Kyle Giacchi",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
  "dependencies": {
    "@tanstack/react-virtual": "^3.13.18",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "exceljs": "^4.4.0",
    "lucide-react": "^1.8.0",
    "papaparse": "^5.4.1",
    "radix-ui": "^1.4.3",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.13.0",
    "recharts": "^3.8.1",
    "tailwind-merge": "^3.5.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.58.2",
    "@tailwindcss/postcss": "^4.2.0",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^25.3.0",
    "@types/papaparse": "^5.3.14",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "@vitest/coverage-v8": "^4.0.18",
    "eslint": "^10.0.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react-hooks": "^7.1.0",
    "eslint-plugin-react-refresh": "^0.5.0",
    "globals": "^17.3.0",
    "jsdom": "^29.0.2",
    "postcss": "^8.4.47",
    "prettier": "^3.8.2",
    "prettier-plugin-tailwindcss": "^0.7.2",
    "tailwindcss": "^4.2.0",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.56.0",
    "vite": "^8.0.8",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` written.

- [ ] **Step 4: Create `.gitignore`**

```
# User reference data (NOT for production)
groupfinanceapp.xlsx
*.xlsx
!tests/fixtures/*.xlsx

# Brainstorm artifacts
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

- [ ] **Step 5: Create `index.html` at repo root**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Group Finance App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `public/favicon.svg`** (placeholder)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f172a"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="18" font-weight="700">$</text></svg>
```

- [ ] **Step 7: Initialize git & make first commit**

```bash
cd D:/ClaudeCode/GroupFinanceApp && git init && git add -A && git commit -m "chore: initialize project with package.json and .gitignore"
```

---

## Task 2: TypeScript configuration

**Files:**

- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Verify typecheck command works (will fail until src/ exists)**

Run: `npm run typecheck`
Expected: error about no input files — that's fine; config is valid.

- [ ] **Step 5: Commit**

```bash
git add tsconfig*.json && git commit -m "chore: add TypeScript configuration"
```

---

## Task 3: Vite + Vitest configuration

**Files:**

- Create: `vite.config.ts`, `vitest.config.ts`, `src/test/setup.ts`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8080,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['**/*.config.*', '**/test/**', '**/*.d.ts', 'src/main.tsx'],
    },
  },
});
```

- [ ] **Step 3: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts vitest.config.ts src/test/setup.ts && git commit -m "chore: add Vite + Vitest configuration"
```

---

## Task 4: Tailwind CSS 4 + PostCSS

**Files:**

- Create: `postcss.config.js`, `src/index.css`

- [ ] **Step 1: Create `postcss.config.js`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 2: Create `src/index.css`**

```css
@import 'tailwindcss';

@theme {
  --color-bg: oklch(0.99 0 0);
  --color-fg: oklch(0.2 0 0);
  --color-muted: oklch(0.96 0 0);
  --color-muted-fg: oklch(0.45 0 0);
  --color-border: oklch(0.92 0 0);
  --color-primary: oklch(0.55 0.18 250);
  --color-primary-fg: oklch(0.99 0 0);
  --color-success: oklch(0.7 0.15 150);
  --color-warning: oklch(0.78 0.15 80);
  --color-danger: oklch(0.6 0.2 25);
  --radius: 0.5rem;
}

html,
body,
#root {
  height: 100%;
}

body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
  -webkit-font-smoothing: antialiased;
}

@layer components {
  .card {
    @apply rounded-lg border bg-white p-4 shadow-sm;
    border-color: var(--color-border);
  }
  .btn {
    @apply inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition;
  }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .btn-primary:hover {
    filter: brightness(0.95);
  }
  .btn-ghost {
    color: var(--color-fg);
  }
  .btn-ghost:hover {
    background: var(--color-muted);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add postcss.config.js src/index.css && git commit -m "chore: add Tailwind CSS 4 setup"
```

---

## Task 5: ESLint + Prettier

**Files:**

- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      complexity: ['warn', { max: 15 }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
);
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist
node_modules
playwright-report
test-results
coverage
*.xlsx
.superpowers
```

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore && git commit -m "chore: add ESLint + Prettier configuration"
```

---

## Task 6: Playwright smoke harness

**Files:**

- Create: `playwright.config.ts`, `tests/smoke.spec.ts`, `tests/fixtures/.gitkeep`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Create `tests/smoke.spec.ts` (will fail until app renders)**

```ts
import { test, expect } from '@playwright/test';

test('app loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Create empty fixtures dir marker**

```bash
mkdir -p tests/fixtures && touch tests/fixtures/.gitkeep
```

- [ ] **Step 4: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: chromium installed.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/ && git commit -m "chore: add Playwright smoke harness"
```

---

## Task 7: Domain types

**Files:**

- Create: `src/types/index.ts`

- [ ] **Step 1: Write the type definitions**

```ts
export type MemberId = string;
export type ExpenseId = string;
export type AssetId = string;
export type DebtId = string;
export type GoalId = string;

export const APP_DATA_VERSION = 1;
export type AppDataVersion = typeof APP_DATA_VERSION;

export type HouseholdMode = 'couples' | 'roommates';

export type FilingStatus = 'single' | 'married_joint' | 'married_separate' | 'head_of_household';

export interface Member {
  id: MemberId;
  name: string;
  color?: string;
}

export interface Household {
  name: string;
  mode: HouseholdMode;
  members: Member[];
}

export interface MemberIncome {
  grossAnnualSalary: number;
  payPeriodsPerYear: number;
  expectedBonus?: number;
  expectedStock?: number;
  preTax: {
    contrib401kPct: number;
    hsaContribAnnual: number;
    rothPct: number;
  };
  filingStatus: FilingStatus;
}

export interface Income {
  byMember: Record<MemberId, MemberIncome>;
}

export type ExpenseCategory =
  | 'essentials'
  | 'utilities'
  | 'insurance'
  | 'subscriptions'
  | 'estimated'
  | 'individual';

export type Cadence = 'annual' | 'monthly';

export type SplitRule =
  | { kind: 'proportional' }
  | { kind: 'equal' }
  | { kind: 'fixed_pct'; allocations: Record<MemberId, number> }
  | { kind: 'individual'; owner: MemberId };

export interface Expense {
  id: ExpenseId;
  name: string;
  category: ExpenseCategory;
  cadence: Cadence;
  amount: number;
  paidBy?: MemberId;
  splitOverride?: SplitRule;
}

export interface TaxBracket {
  upTo: number | null; // null = no upper bound (top bracket)
  rate: number; // 0.0–1.0
}

export interface TaxBrackets {
  single: TaxBracket[];
  married_joint: TaxBracket[];
  married_separate: TaxBracket[];
  head_of_household: TaxBracket[];
}

export interface TaxConfig {
  year: number;
  state?: string;
  stateFlatRate?: number;
  brackets: TaxBrackets;
}

export type AssetType = 'cash' | 'crypto' | 'investment' | 'retirement' | 'hsa';

export interface Asset {
  id: AssetId;
  name: string;
  type: AssetType;
  balance: number;
  owner?: MemberId;
  asOf: number;
}

export type DebtType = 'credit_card' | 'loan' | 'asset_loan';

export interface Debt {
  id: DebtId;
  name: string;
  type: DebtType;
  balance: number;
  minMonthlyPayment?: number;
  interestRate?: number;
  owner?: MemberId;
  asOf: number;
}

export interface Goal {
  id: GoalId;
  name: string;
  targetAmount: number;
  allocated: number;
  targetDate?: number;
  monthlyContribution?: number;
}

export interface Snapshot {
  date: number;
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  monthlyGuiltFree: number;
  goalProgress: Record<GoalId, number>;
}

export type AnalysisMode = 'simple' | 'power';

export interface AppSettings {
  analysisMode: AnalysisMode;
  snapshotIntervalDays: number;
}

export interface AppData {
  version: AppDataVersion;
  lastModified: number;
  household: Household;
  income: Income;
  expenses: Expense[];
  taxConfig: TaxConfig;
  assets: Asset[];
  debts: Debt[];
  goals: Goal[];
  snapshots: Snapshot[];
  settings: AppSettings;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/ && git commit -m "feat(types): add domain types for AppData"
```

---

## Task 8: Zod schemas mirroring types

**Files:**

- Create: `src/schemas/index.ts`
- Test: `src/schemas/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/schemas/index.test.ts
import { describe, expect, it } from 'vitest';
import { AppDataSchema, defaultAppData } from './index';

describe('AppDataSchema', () => {
  it('parses the default AppData', () => {
    const result = AppDataSchema.safeParse(defaultAppData());
    expect(result.success).toBe(true);
  });

  it('rejects invalid version', () => {
    const bad = { ...defaultAppData(), version: 999 };
    const result = AppDataSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects negative income', () => {
    const data = defaultAppData();
    const bad = {
      ...data,
      income: {
        byMember: {
          m1: {
            grossAnnualSalary: -1,
            payPeriodsPerYear: 26,
            preTax: { contrib401kPct: 0, hsaContribAnnual: 0, rothPct: 0 },
            filingStatus: 'single',
          },
        },
      },
    };
    expect(AppDataSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/schemas/index.test.ts`
Expected: FAIL with "cannot find module".

- [ ] **Step 3: Write `src/schemas/index.ts`**

```ts
import { z } from 'zod';
import { APP_DATA_VERSION, type AppData } from '@/types';

const MemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
});

const HouseholdSchema = z.object({
  name: z.string(),
  mode: z.enum(['couples', 'roommates']),
  members: z.array(MemberSchema).min(1),
});

const MemberIncomeSchema = z.object({
  grossAnnualSalary: z.number().min(0),
  payPeriodsPerYear: z.number().int().min(1).max(53),
  expectedBonus: z.number().min(0).optional(),
  expectedStock: z.number().min(0).optional(),
  preTax: z.object({
    contrib401kPct: z.number().min(0).max(1),
    hsaContribAnnual: z.number().min(0),
    rothPct: z.number().min(0).max(1),
  }),
  filingStatus: z.enum(['single', 'married_joint', 'married_separate', 'head_of_household']),
});

const IncomeSchema = z.object({
  byMember: z.record(z.string(), MemberIncomeSchema),
});

const SplitRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('proportional') }),
  z.object({ kind: z.literal('equal') }),
  z.object({
    kind: z.literal('fixed_pct'),
    allocations: z.record(z.string(), z.number().min(0).max(1)),
  }),
  z.object({ kind: z.literal('individual'), owner: z.string() }),
]);

const ExpenseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum([
    'essentials',
    'utilities',
    'insurance',
    'subscriptions',
    'estimated',
    'individual',
  ]),
  cadence: z.enum(['annual', 'monthly']),
  amount: z.number().min(0),
  paidBy: z.string().optional(),
  splitOverride: SplitRuleSchema.optional(),
});

const TaxBracketSchema = z.object({
  upTo: z.number().nullable(),
  rate: z.number().min(0).max(1),
});

const TaxBracketsSchema = z.object({
  single: z.array(TaxBracketSchema),
  married_joint: z.array(TaxBracketSchema),
  married_separate: z.array(TaxBracketSchema),
  head_of_household: z.array(TaxBracketSchema),
});

const TaxConfigSchema = z.object({
  year: z.number().int(),
  state: z.string().optional(),
  stateFlatRate: z.number().min(0).max(1).optional(),
  brackets: TaxBracketsSchema,
});

const AssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['cash', 'crypto', 'investment', 'retirement', 'hsa']),
  balance: z.number(),
  owner: z.string().optional(),
  asOf: z.number().int(),
});

const DebtSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['credit_card', 'loan', 'asset_loan']),
  balance: z.number().min(0),
  minMonthlyPayment: z.number().min(0).optional(),
  interestRate: z.number().min(0).max(1).optional(),
  owner: z.string().optional(),
  asOf: z.number().int(),
});

const GoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetAmount: z.number().min(0),
  allocated: z.number().min(0),
  targetDate: z.number().int().optional(),
  monthlyContribution: z.number().min(0).optional(),
});

const SnapshotSchema = z.object({
  date: z.number().int(),
  netWorth: z.number(),
  totalAssets: z.number(),
  totalDebt: z.number(),
  monthlyGuiltFree: z.number(),
  goalProgress: z.record(z.string(), z.number()),
});

const AppSettingsSchema = z.object({
  analysisMode: z.enum(['simple', 'power']),
  snapshotIntervalDays: z.number().int().min(1),
});

export const AppDataSchema = z.object({
  version: z.literal(APP_DATA_VERSION),
  lastModified: z.number().int(),
  household: HouseholdSchema,
  income: IncomeSchema,
  expenses: z.array(ExpenseSchema),
  taxConfig: TaxConfigSchema,
  assets: z.array(AssetSchema),
  debts: z.array(DebtSchema),
  goals: z.array(GoalSchema),
  snapshots: z.array(SnapshotSchema),
  settings: AppSettingsSchema,
});

export const DEFAULT_BRACKETS_2026: import('@/types').TaxBrackets = {
  // Placeholder neutral defaults — replaced with real 2026 IRS brackets in Plan 2.
  single: [
    { upTo: 11600, rate: 0.1 },
    { upTo: 47150, rate: 0.12 },
    { upTo: 100525, rate: 0.22 },
    { upTo: 191950, rate: 0.24 },
    { upTo: 243725, rate: 0.32 },
    { upTo: 609350, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  married_joint: [
    { upTo: 23200, rate: 0.1 },
    { upTo: 94300, rate: 0.12 },
    { upTo: 201050, rate: 0.22 },
    { upTo: 383900, rate: 0.24 },
    { upTo: 487450, rate: 0.32 },
    { upTo: 731200, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  married_separate: [
    { upTo: 11600, rate: 0.1 },
    { upTo: 47150, rate: 0.12 },
    { upTo: 100525, rate: 0.22 },
    { upTo: 191950, rate: 0.24 },
    { upTo: 243725, rate: 0.32 },
    { upTo: 365600, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  head_of_household: [
    { upTo: 16550, rate: 0.1 },
    { upTo: 63100, rate: 0.12 },
    { upTo: 100500, rate: 0.22 },
    { upTo: 191950, rate: 0.24 },
    { upTo: 243700, rate: 0.32 },
    { upTo: 609350, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
};

export function defaultAppData(): AppData {
  return {
    version: APP_DATA_VERSION,
    lastModified: Date.now(),
    household: { name: '', mode: 'couples', members: [] },
    income: { byMember: {} },
    expenses: [],
    taxConfig: { year: 2026, brackets: DEFAULT_BRACKETS_2026 },
    assets: [],
    debts: [],
    goals: [],
    snapshots: [],
    settings: { analysisMode: 'simple', snapshotIntervalDays: 30 },
  };
}
```

Note: `defaultAppData()` returns a household with **0 members**, which fails `HouseholdSchema.min(1)`. The default exists for type purposes; tests must add at least one member. Update the schema to allow empty during onboarding:

Replace `members: z.array(MemberSchema).min(1)` with `members: z.array(MemberSchema)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/schemas/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schemas/ src/types/ && git commit -m "feat(schemas): add Zod schemas mirroring AppData types"
```

---

## Task 9: storageKeys + safeStorage

**Files:**

- Create: `src/lib/storageKeys.ts`, `src/lib/safeStorage.ts`, `src/lib/utils.ts`
- Test: `src/lib/safeStorage.test.ts`

- [ ] **Step 1: Create `src/lib/storageKeys.ts`**

```ts
export const STORAGE_KEYS = {
  appData: 'groupfinance.appData',
  uiPrefs: 'groupfinance.uiPrefs',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
```

- [ ] **Step 2: Create `src/lib/utils.ts`** (cn helper)

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Write the failing test**

```ts
// src/lib/safeStorage.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { safeLocalStorage, MAX_OBJECT_BYTES } from './safeStorage';

describe('safeLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a string', () => {
    safeLocalStorage.setItem('k', 'hello');
    expect(safeLocalStorage.getItem('k')).toBe('hello');
  });

  it('round-trips a primitive boolean serialized as JSON', () => {
    safeLocalStorage.setItem('flag', JSON.stringify(true));
    expect(safeLocalStorage.getItem('flag')).toBe('true');
  });

  it('rejects oversized JSON object', () => {
    const huge = JSON.stringify({ blob: 'x'.repeat(MAX_OBJECT_BYTES + 100) });
    expect(() => safeLocalStorage.setItem('big', huge)).toThrow();
  });

  it('removes a key', () => {
    safeLocalStorage.setItem('k', 'v');
    safeLocalStorage.removeItem('k');
    expect(safeLocalStorage.getItem('k')).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- src/lib/safeStorage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Create `src/lib/safeStorage.ts`**

```ts
export const MAX_OBJECT_BYTES = 5 * 1024 * 1024; // 5 MB

function isAvailable(): boolean {
  try {
    const k = '__sl_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function validateObjectSize(value: string): void {
  // Only enforce on JSON objects, not primitives
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return; // not JSON; pass through
  }
  if (parsed === null || typeof parsed !== 'object') {
    return; // primitive — pass through
  }
  const bytes = new Blob([value]).size;
  if (bytes > MAX_OBJECT_BYTES) {
    throw new Error(`safeLocalStorage: payload ${bytes} bytes exceeds cap ${MAX_OBJECT_BYTES}`);
  }
}

export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (!isAvailable()) return null;
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (!isAvailable()) return;
    validateObjectSize(value);
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (!isAvailable()) return;
    window.localStorage.removeItem(key);
  },
};
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test -- src/lib/safeStorage.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ && git commit -m "feat(lib): add safeLocalStorage with object size cap + storage keys"
```

---

## Task 10: Migrations chain (v1 only)

**Files:**

- Create: `src/utils/migrations.ts`, `src/utils/ids.ts`
- Test: `src/utils/migrations.test.ts`

- [ ] **Step 1: Create `src/utils/ids.ts`**

```ts
export function newId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/utils/migrations.test.ts
import { describe, expect, it } from 'vitest';
import { migrate, CURRENT_VERSION } from './migrations';
import { defaultAppData } from '@/schemas';

describe('migrate', () => {
  it('returns data unchanged at current version', () => {
    const data = defaultAppData();
    expect(migrate(data)).toEqual(data);
  });

  it('rejects an unknown future version', () => {
    expect(() => migrate({ ...defaultAppData(), version: 999 })).toThrow();
  });

  it('CURRENT_VERSION matches APP_DATA_VERSION', async () => {
    const { APP_DATA_VERSION } = await import('@/types');
    expect(CURRENT_VERSION).toBe(APP_DATA_VERSION);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/utils/migrations.test.ts`
Expected: FAIL.

- [ ] **Step 4: Create `src/utils/migrations.ts`**

```ts
import { APP_DATA_VERSION, type AppData } from '@/types';

export const CURRENT_VERSION = APP_DATA_VERSION;

type AnyVersionedData = { version: number } & Record<string, unknown>;

export function migrate(data: AnyVersionedData | AppData): AppData {
  let cur: AnyVersionedData = data as AnyVersionedData;
  while (cur.version !== CURRENT_VERSION) {
    if (cur.version > CURRENT_VERSION) {
      throw new Error(
        `migrate: data version ${cur.version} is newer than CURRENT_VERSION ${CURRENT_VERSION}`,
      );
    }
    // No previous versions yet. When we add v2, route here:
    //   if (cur.version === 1) cur = migrateV1ToV2(cur);
    throw new Error(`migrate: no migration registered for version ${cur.version}`);
  }
  return cur as AppData;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/utils/migrations.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/ && git commit -m "feat(utils): add migrations chain + id generator"
```

---

## Task 11: DataRepository

**Files:**

- Create: `src/services/DataRepository.ts`
- Test: `src/services/DataRepository.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/DataRepository.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { defaultAppData } from '@/schemas';
import { dataRepository } from './DataRepository';

describe('DataRepository', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing stored', () => {
    expect(dataRepository.load()).toBeNull();
  });

  it('round-trips AppData', () => {
    const data = defaultAppData();
    dataRepository.save(data);
    expect(dataRepository.load()).toEqual(data);
  });

  it('returns null for invalid stored data', () => {
    localStorage.setItem('groupfinance.appData', '{ "garbage": true }');
    expect(dataRepository.load()).toBeNull();
  });

  it('clears stored data', () => {
    dataRepository.save(defaultAppData());
    dataRepository.clear();
    expect(dataRepository.load()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/services/DataRepository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/services/DataRepository.ts`**

```ts
import { AppDataSchema } from '@/schemas';
import { safeLocalStorage } from '@/lib/safeStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { migrate } from '@/utils/migrations';
import type { AppData } from '@/types';

export const dataRepository = {
  load(): AppData | null {
    const raw = safeLocalStorage.getItem(STORAGE_KEYS.appData);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const migrated = migrate(parsed);
      const result = AppDataSchema.safeParse(migrated);
      if (!result.success) {
        console.error('AppData failed schema validation', result.error);
        return null;
      }
      return result.data;
    } catch (e) {
      console.error('Failed to load AppData', e);
      return null;
    }
  },

  save(data: AppData): void {
    const next = { ...data, lastModified: Date.now() };
    safeLocalStorage.setItem(STORAGE_KEYS.appData, JSON.stringify(next));
  },

  clear(): void {
    safeLocalStorage.removeItem(STORAGE_KEYS.appData);
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/services/DataRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ && git commit -m "feat(services): add DataRepository with schema validation"
```

---

## Task 12: useEntityReducer hook

**Files:**

- Create: `src/hooks/useEntityReducer.ts`
- Test: `src/hooks/useEntityReducer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useEntityReducer.test.tsx
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntityReducer } from './useEntityReducer';

interface Item {
  id: string;
  name: string;
}

describe('useEntityReducer', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useEntityReducer<Item>([]));
    expect(result.current.entities).toEqual([]);
  });

  it('adds an entity', () => {
    const { result } = renderHook(() => useEntityReducer<Item>([]));
    act(() => result.current.add({ id: 'a', name: 'A' }));
    expect(result.current.entities).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('updates an entity', () => {
    const { result } = renderHook(() => useEntityReducer<Item>([{ id: 'a', name: 'A' }]));
    act(() => result.current.update('a', { name: 'AA' }));
    expect(result.current.entities[0].name).toBe('AA');
  });

  it('removes an entity', () => {
    const { result } = renderHook(() => useEntityReducer<Item>([{ id: 'a', name: 'A' }]));
    act(() => result.current.remove('a'));
    expect(result.current.entities).toEqual([]);
  });

  it('replaces all entities', () => {
    const { result } = renderHook(() => useEntityReducer<Item>([{ id: 'a', name: 'A' }]));
    act(() => result.current.setEntities([{ id: 'b', name: 'B' }]));
    expect(result.current.entities).toEqual([{ id: 'b', name: 'B' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/hooks/useEntityReducer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/hooks/useEntityReducer.ts`**

```ts
import { useCallback, useState } from 'react';

export interface EntityWithId {
  id: string;
}

export interface UseEntityReducerResult<T extends EntityWithId> {
  entities: T[];
  add: (entity: T) => void;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
  setEntities: (next: T[]) => void;
}

export function useEntityReducer<T extends EntityWithId>(initial: T[]): UseEntityReducerResult<T> {
  const [entities, setEntitiesState] = useState<T[]>(initial);

  const add = useCallback((entity: T) => {
    setEntitiesState((prev) => [...prev, entity]);
  }, []);

  const update = useCallback((id: string, patch: Partial<T>) => {
    setEntitiesState((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const remove = useCallback((id: string) => {
    setEntitiesState((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const setEntities = useCallback((next: T[]) => {
    setEntitiesState(next);
  }, []);

  return { entities, add, update, remove, setEntities };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/hooks/useEntityReducer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEntityReducer* && git commit -m "feat(hooks): add useEntityReducer for CRUD on id-keyed arrays"
```

---

## Task 13: AppDataProvider — single write path

**Files:**

- Create: `src/contexts/AppDataProvider.tsx`
- Test: `src/contexts/AppDataProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/contexts/AppDataProvider.test.tsx
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { AppDataProvider, useAppData } from './AppDataProvider';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useAppData>) => void }) {
  const api = useAppData();
  onReady(api);
  return null;
}

describe('AppDataProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it('initializes with default data when storage is empty', () => {
    let api!: ReturnType<typeof useAppData>;
    render(
      <AppDataProvider>
        <Probe onReady={(a) => (api = a)} />
      </AppDataProvider>,
    );
    expect(api.appData.version).toBe(defaultAppData().version);
  });

  it('debounces writes to localStorage', () => {
    let api!: ReturnType<typeof useAppData>;
    render(
      <AppDataProvider>
        <Probe onReady={(a) => (api = a)} />
      </AppDataProvider>,
    );
    act(() => api.updateHouseholdSlice({ ...api.appData.household, name: 'Test' }));
    expect(dataRepository.load()).toBeNull(); // not yet flushed
    act(() => vi.advanceTimersByTime(350));
    expect(dataRepository.load()?.household.name).toBe('Test');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/contexts/AppDataProvider.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/contexts/AppDataProvider.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppData,
  Household,
  Income,
  Expense,
  TaxConfig,
  Asset,
  Debt,
  Goal,
  Snapshot,
  AppSettings,
} from '@/types';
import { defaultAppData } from '@/schemas';
import { dataRepository } from '@/services/DataRepository';

const SAVE_DEBOUNCE_MS = 300;

export interface AppDataContextValue {
  appData: AppData;
  updateHouseholdSlice: (next: Household) => void;
  updateIncomeSlice: (next: Income) => void;
  updateExpensesSlice: (next: Expense[]) => void;
  updateTaxSlice: (next: TaxConfig) => void;
  updateAssetsSlice: (next: Asset[]) => void;
  updateDebtsSlice: (next: Debt[]) => void;
  updateGoalsSlice: (next: Goal[]) => void;
  updateSnapshotsSlice: (next: Snapshot[]) => void;
  updateSettingsSlice: (next: AppSettings) => void;
  resetAll: () => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [appData, setAppData] = useState<AppData>(() => dataRepository.load() ?? defaultAppData());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((next: AppData) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dataRepository.save(next);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const merge = useCallback(
    <K extends keyof AppData>(key: K, value: AppData[K]) => {
      setAppData((prev) => {
        const next = { ...prev, [key]: value, lastModified: Date.now() };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      appData,
      updateHouseholdSlice: (next) => merge('household', next),
      updateIncomeSlice: (next) => merge('income', next),
      updateExpensesSlice: (next) => merge('expenses', next),
      updateTaxSlice: (next) => merge('taxConfig', next),
      updateAssetsSlice: (next) => merge('assets', next),
      updateDebtsSlice: (next) => merge('debts', next),
      updateGoalsSlice: (next) => merge('goals', next),
      updateSnapshotsSlice: (next) => merge('snapshots', next),
      updateSettingsSlice: (next) => merge('settings', next),
      resetAll: () => {
        const fresh = defaultAppData();
        setAppData(fresh);
        dataRepository.clear();
      },
    }),
    [appData, merge],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/contexts/AppDataProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AppDataProvider* && git commit -m "feat(contexts): add AppDataProvider with debounced single write path"
```

---

## Task 14: Slice providers (Household / Income / Expenses / Tax / Assets / Debts / Goals / Snapshots / UIState)

**Files:**

- Create: `src/contexts/HouseholdProvider.tsx`, `src/contexts/IncomeProvider.tsx`, `src/contexts/ExpensesProvider.tsx`, `src/contexts/TaxProvider.tsx`, `src/contexts/AssetsProvider.tsx`, `src/contexts/DebtsProvider.tsx`, `src/contexts/GoalsProvider.tsx`, `src/contexts/SnapshotsProvider.tsx`, `src/contexts/UIStateProvider.tsx`

Each slice provider has the same shape: read its slice from `useAppData()`, expose mutator helpers that call `updateXxxSlice`.

- [ ] **Step 1: Create `src/contexts/HouseholdProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Household, Member, MemberId } from '@/types';

export interface HouseholdContextValue {
  household: Household;
  setName: (name: string) => void;
  setMode: (mode: Household['mode']) => void;
  addMember: (member: Member) => void;
  updateMember: (id: MemberId, patch: Partial<Member>) => void;
  removeMember: (id: MemberId) => void;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { appData, updateHouseholdSlice } = useAppData();
  const household = appData.household;

  const value = useMemo<HouseholdContextValue>(
    () => ({
      household,
      setName: (name) => updateHouseholdSlice({ ...household, name }),
      setMode: (mode) => updateHouseholdSlice({ ...household, mode }),
      addMember: (m) => updateHouseholdSlice({ ...household, members: [...household.members, m] }),
      updateMember: (id, patch) =>
        updateHouseholdSlice({
          ...household,
          members: household.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }),
      removeMember: (id) =>
        updateHouseholdSlice({
          ...household,
          members: household.members.filter((m) => m.id !== id),
        }),
    }),
    [household, updateHouseholdSlice],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
```

- [ ] **Step 2: Create `src/contexts/IncomeProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { MemberId, MemberIncome } from '@/types';

export interface IncomeContextValue {
  byMember: Record<MemberId, MemberIncome>;
  setMemberIncome: (id: MemberId, income: MemberIncome) => void;
  removeMemberIncome: (id: MemberId) => void;
}

const IncomeContext = createContext<IncomeContextValue | null>(null);

export function IncomeProvider({ children }: { children: ReactNode }) {
  const { appData, updateIncomeSlice } = useAppData();
  const byMember = appData.income.byMember;

  const value = useMemo<IncomeContextValue>(
    () => ({
      byMember,
      setMemberIncome: (id, income) =>
        updateIncomeSlice({ byMember: { ...byMember, [id]: income } }),
      removeMemberIncome: (id) => {
        const copy = { ...byMember };
        delete copy[id];
        updateIncomeSlice({ byMember: copy });
      },
    }),
    [byMember, updateIncomeSlice],
  );

  return <IncomeContext.Provider value={value}>{children}</IncomeContext.Provider>;
}

export function useIncome(): IncomeContextValue {
  const ctx = useContext(IncomeContext);
  if (!ctx) throw new Error('useIncome must be used within IncomeProvider');
  return ctx;
}
```

- [ ] **Step 3: Create `src/contexts/ExpensesProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Expense, ExpenseId } from '@/types';

export interface ExpensesContextValue {
  expenses: Expense[];
  addExpense: (e: Expense) => void;
  updateExpense: (id: ExpenseId, patch: Partial<Expense>) => void;
  removeExpense: (id: ExpenseId) => void;
  setExpenses: (next: Expense[]) => void;
}

const ExpensesContext = createContext<ExpensesContextValue | null>(null);

export function ExpensesProvider({ children }: { children: ReactNode }) {
  const { appData, updateExpensesSlice } = useAppData();
  const expenses = appData.expenses;

  const value = useMemo<ExpensesContextValue>(
    () => ({
      expenses,
      addExpense: (e) => updateExpensesSlice([...expenses, e]),
      updateExpense: (id, patch) =>
        updateExpensesSlice(expenses.map((e) => (e.id === id ? { ...e, ...patch } : e))),
      removeExpense: (id) => updateExpensesSlice(expenses.filter((e) => e.id !== id)),
      setExpenses: (next) => updateExpensesSlice(next),
    }),
    [expenses, updateExpensesSlice],
  );

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export function useExpenses(): ExpensesContextValue {
  const ctx = useContext(ExpensesContext);
  if (!ctx) throw new Error('useExpenses must be used within ExpensesProvider');
  return ctx;
}
```

- [ ] **Step 4: Create `src/contexts/TaxProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { TaxConfig } from '@/types';

export interface TaxContextValue {
  taxConfig: TaxConfig;
  setTaxConfig: (next: TaxConfig) => void;
}

const TaxContext = createContext<TaxContextValue | null>(null);

export function TaxProvider({ children }: { children: ReactNode }) {
  const { appData, updateTaxSlice } = useAppData();
  const value = useMemo<TaxContextValue>(
    () => ({ taxConfig: appData.taxConfig, setTaxConfig: updateTaxSlice }),
    [appData.taxConfig, updateTaxSlice],
  );
  return <TaxContext.Provider value={value}>{children}</TaxContext.Provider>;
}

export function useTax(): TaxContextValue {
  const ctx = useContext(TaxContext);
  if (!ctx) throw new Error('useTax must be used within TaxProvider');
  return ctx;
}
```

- [ ] **Step 5: Create `src/contexts/AssetsProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Asset, AssetId } from '@/types';

export interface AssetsContextValue {
  assets: Asset[];
  addAsset: (a: Asset) => void;
  updateAsset: (id: AssetId, patch: Partial<Asset>) => void;
  removeAsset: (id: AssetId) => void;
  setAssets: (next: Asset[]) => void;
}

const AssetsContext = createContext<AssetsContextValue | null>(null);

export function AssetsProvider({ children }: { children: ReactNode }) {
  const { appData, updateAssetsSlice } = useAppData();
  const assets = appData.assets;
  const value = useMemo<AssetsContextValue>(
    () => ({
      assets,
      addAsset: (a) => updateAssetsSlice([...assets, a]),
      updateAsset: (id, patch) =>
        updateAssetsSlice(assets.map((a) => (a.id === id ? { ...a, ...patch } : a))),
      removeAsset: (id) => updateAssetsSlice(assets.filter((a) => a.id !== id)),
      setAssets: updateAssetsSlice,
    }),
    [assets, updateAssetsSlice],
  );
  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

export function useAssets(): AssetsContextValue {
  const ctx = useContext(AssetsContext);
  if (!ctx) throw new Error('useAssets must be used within AssetsProvider');
  return ctx;
}
```

- [ ] **Step 6: Create `src/contexts/DebtsProvider.tsx`** (same shape, debts)

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Debt, DebtId } from '@/types';

export interface DebtsContextValue {
  debts: Debt[];
  addDebt: (d: Debt) => void;
  updateDebt: (id: DebtId, patch: Partial<Debt>) => void;
  removeDebt: (id: DebtId) => void;
  setDebts: (next: Debt[]) => void;
}

const DebtsContext = createContext<DebtsContextValue | null>(null);

export function DebtsProvider({ children }: { children: ReactNode }) {
  const { appData, updateDebtsSlice } = useAppData();
  const debts = appData.debts;
  const value = useMemo<DebtsContextValue>(
    () => ({
      debts,
      addDebt: (d) => updateDebtsSlice([...debts, d]),
      updateDebt: (id, patch) =>
        updateDebtsSlice(debts.map((d) => (d.id === id ? { ...d, ...patch } : d))),
      removeDebt: (id) => updateDebtsSlice(debts.filter((d) => d.id !== id)),
      setDebts: updateDebtsSlice,
    }),
    [debts, updateDebtsSlice],
  );
  return <DebtsContext.Provider value={value}>{children}</DebtsContext.Provider>;
}

export function useDebts(): DebtsContextValue {
  const ctx = useContext(DebtsContext);
  if (!ctx) throw new Error('useDebts must be used within DebtsProvider');
  return ctx;
}
```

- [ ] **Step 7: Create `src/contexts/GoalsProvider.tsx`** (same shape, goals)

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Goal, GoalId } from '@/types';

export interface GoalsContextValue {
  goals: Goal[];
  addGoal: (g: Goal) => void;
  updateGoal: (id: GoalId, patch: Partial<Goal>) => void;
  removeGoal: (id: GoalId) => void;
  setGoals: (next: Goal[]) => void;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { appData, updateGoalsSlice } = useAppData();
  const goals = appData.goals;
  const value = useMemo<GoalsContextValue>(
    () => ({
      goals,
      addGoal: (g) => updateGoalsSlice([...goals, g]),
      updateGoal: (id, patch) =>
        updateGoalsSlice(goals.map((g) => (g.id === id ? { ...g, ...patch } : g))),
      removeGoal: (id) => updateGoalsSlice(goals.filter((g) => g.id !== id)),
      setGoals: updateGoalsSlice,
    }),
    [goals, updateGoalsSlice],
  );
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals(): GoalsContextValue {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error('useGoals must be used within GoalsProvider');
  return ctx;
}
```

- [ ] **Step 8: Create `src/contexts/SnapshotsProvider.tsx`** (append-only)

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { Snapshot } from '@/types';

export interface SnapshotsContextValue {
  snapshots: Snapshot[];
  appendSnapshot: (s: Snapshot) => void;
  trimOlderThan: (timestamp: number) => void;
}

const SnapshotsContext = createContext<SnapshotsContextValue | null>(null);

export function SnapshotsProvider({ children }: { children: ReactNode }) {
  const { appData, updateSnapshotsSlice } = useAppData();
  const snapshots = appData.snapshots;
  const value = useMemo<SnapshotsContextValue>(
    () => ({
      snapshots,
      appendSnapshot: (s) => updateSnapshotsSlice([...snapshots, s]),
      trimOlderThan: (timestamp) =>
        updateSnapshotsSlice(snapshots.filter((s) => s.date >= timestamp)),
    }),
    [snapshots, updateSnapshotsSlice],
  );
  return <SnapshotsContext.Provider value={value}>{children}</SnapshotsContext.Provider>;
}

export function useSnapshots(): SnapshotsContextValue {
  const ctx = useContext(SnapshotsContext);
  if (!ctx) throw new Error('useSnapshots must be used within SnapshotsProvider');
  return ctx;
}
```

- [ ] **Step 9: Create `src/contexts/UIStateProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppData } from './AppDataProvider';
import type { AnalysisMode } from '@/types';

export interface UIStateContextValue {
  analysisMode: AnalysisMode;
  setAnalysisMode: (mode: AnalysisMode) => void;
  snapshotIntervalDays: number;
  setSnapshotIntervalDays: (days: number) => void;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const { appData, updateSettingsSlice } = useAppData();
  const settings = appData.settings;
  const value = useMemo<UIStateContextValue>(
    () => ({
      analysisMode: settings.analysisMode,
      setAnalysisMode: (analysisMode) => updateSettingsSlice({ ...settings, analysisMode }),
      snapshotIntervalDays: settings.snapshotIntervalDays,
      setSnapshotIntervalDays: (snapshotIntervalDays) =>
        updateSettingsSlice({ ...settings, snapshotIntervalDays }),
    }),
    [settings, updateSettingsSlice],
  );
  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState(): UIStateContextValue {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error('useUIState must be used within UIStateProvider');
  return ctx;
}
```

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/contexts/ && git commit -m "feat(contexts): add slice providers for all domain slices"
```

---

## Task 15: useFinance unified hook

**Files:**

- Create: `src/hooks/useFinance.ts`

- [ ] **Step 1: Create the unified hook**

```ts
import { useAppData } from '@/contexts/AppDataProvider';
import { useHousehold } from '@/contexts/HouseholdProvider';
import { useIncome } from '@/contexts/IncomeProvider';
import { useExpenses } from '@/contexts/ExpensesProvider';
import { useUIState } from '@/contexts/UIStateProvider';

export function useFinance() {
  const app = useAppData();
  const household = useHousehold();
  const income = useIncome();
  const expenses = useExpenses();
  const ui = useUIState();
  return {
    ...app,
    ...household,
    ...income,
    ...expenses,
    ...ui,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFinance.ts && git commit -m "feat(hooks): add unified useFinance hook"
```

---

## Task 16: App shell — Sidebar + TopBar + AppShell + ModeToggle

**Files:**

- Create: `src/components/common/Sidebar.tsx`, `src/components/common/TopBar.tsx`, `src/components/common/ModeToggle.tsx`, `src/components/common/AppShell.tsx`

- [ ] **Step 1: Create `src/components/common/ModeToggle.tsx`**

```tsx
import { useUIState } from '@/contexts/UIStateProvider';

export function ModeToggle() {
  const { analysisMode, setAnalysisMode } = useUIState();
  const isPower = analysisMode === 'power';
  return (
    <button
      type="button"
      onClick={() => setAnalysisMode(isPower ? 'simple' : 'power')}
      className="btn btn-ghost border"
      aria-pressed={isPower}
      aria-label="Toggle analysis mode"
    >
      {isPower ? 'Power' : 'Simple'}
    </button>
  );
}
```

- [ ] **Step 2: Create `src/components/common/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/income', label: 'Income' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/tax', label: 'Tax' },
  { to: '/assets', label: 'Assets' },
  { to: '/debt', label: 'Debt' },
  { to: '/goals', label: 'Goals' },
  { to: '/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r p-3 md:block">
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm hover:bg-[var(--color-muted)]',
                isActive && 'bg-[var(--color-muted)] font-medium',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create `src/components/common/TopBar.tsx`**

```tsx
import { ModeToggle } from './ModeToggle';
import { useHousehold } from '@/contexts/HouseholdProvider';

export function TopBar() {
  const { household } = useHousehold();
  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="font-semibold">{household.name || 'Group Finance'}</div>
      <div className="flex items-center gap-2">
        <ModeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create `src/components/common/AppShell.tsx`**

```tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/common/ && git commit -m "feat(common): add app shell with sidebar, top bar, and mode toggle"
```

---

## Task 17: First-run guard

**Files:**

- Create: `src/components/common/FirstRunGuard.tsx`

- [ ] **Step 1: Create the guard component**

```tsx
import { useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHousehold } from '@/contexts/HouseholdProvider';

export function FirstRunGuard({ children }: { children: ReactNode }) {
  const { household } = useHousehold();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const needsSetup = household.members.length === 0;

  useEffect(() => {
    if (needsSetup && pathname !== '/setup') {
      navigate('/setup', { replace: true });
    }
  }, [needsSetup, pathname, navigate]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/FirstRunGuard.tsx && git commit -m "feat(common): add first-run guard redirect to /setup"
```

---

## Task 18: Setup wizard page

**Files:**

- Create: `src/pages/Setup.tsx`

- [ ] **Step 1: Create `src/pages/Setup.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHousehold } from '@/contexts/HouseholdProvider';
import { newId } from '@/utils/ids';
import type { HouseholdMode } from '@/types';

export function Setup() {
  const { household, setName, setMode, addMember } = useHousehold();
  const navigate = useNavigate();
  const [name, setLocalName] = useState(household.name);
  const [mode, setLocalMode] = useState<HouseholdMode>(household.mode);
  const [memberInput, setMemberInput] = useState('');
  const members = household.members;

  function handleAddMember() {
    const trimmed = memberInput.trim();
    if (!trimmed) return;
    addMember({ id: newId(), name: trimmed });
    setMemberInput('');
  }

  function handleFinish() {
    setName(name.trim() || 'My Household');
    setMode(mode);
    navigate('/', { replace: true });
  }

  const canFinish = members.length >= 1;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Set up your household</h1>

      <section className="card space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Household name</span>
          <input
            type="text"
            className="mt-1 w-full rounded border p-2"
            value={name}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="e.g., The Smiths"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Mode</legend>
          <div className="mt-2 flex gap-3">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'couples'}
                onChange={() => setLocalMode('couples')}
              />
              Couples (proportional split by income)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'roommates'}
                onChange={() => setLocalMode('roommates')}
              />
              Roommates (equal split)
            </label>
          </div>
        </fieldset>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Members</h2>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded border p-2"
            value={memberInput}
            placeholder="Add a name"
            onChange={(e) => setMemberInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddMember();
            }}
          />
          <button type="button" className="btn btn-primary" onClick={handleAddMember}>
            Add
          </button>
        </div>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.id} className="rounded border p-2">
              {m.name}
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        className="btn btn-primary disabled:opacity-50"
        disabled={!canFinish}
        onClick={handleFinish}
      >
        Finish
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Setup.tsx && git commit -m "feat(setup): add first-run setup wizard"
```

---

## Task 19: Empty placeholder pages

**Files:**

- Create: `src/pages/Dashboard.tsx`, `src/pages/Income.tsx`, `src/pages/Expenses.tsx`, `src/pages/TaxCalculator.tsx`, `src/pages/Assets.tsx`, `src/pages/Debt.tsx`, `src/pages/Goals.tsx`, `src/pages/Settings.tsx`

- [ ] **Step 1: Create one stub per page (same pattern)**

For each page, write a file with this template (substitute name + path):

```tsx
// src/pages/Dashboard.tsx
export function Dashboard() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-[var(--color-muted-fg)]">Coming in Plan 2.</p>
    </div>
  );
}
```

Repeat for `Income`, `Expenses`, `TaxCalculator`, `Assets`, `Debt`, `Goals`, `Settings` — substituting the heading and exporting a function with the file's name.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ && git commit -m "feat(pages): add stub pages for all routes"
```

---

## Task 20: App.tsx + main.tsx — wire it all together

**Files:**

- Create: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Create `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppDataProvider } from '@/contexts/AppDataProvider';
import { HouseholdProvider } from '@/contexts/HouseholdProvider';
import { IncomeProvider } from '@/contexts/IncomeProvider';
import { ExpensesProvider } from '@/contexts/ExpensesProvider';
import { TaxProvider } from '@/contexts/TaxProvider';
import { AssetsProvider } from '@/contexts/AssetsProvider';
import { DebtsProvider } from '@/contexts/DebtsProvider';
import { GoalsProvider } from '@/contexts/GoalsProvider';
import { SnapshotsProvider } from '@/contexts/SnapshotsProvider';
import { UIStateProvider } from '@/contexts/UIStateProvider';
import { AppShell } from '@/components/common/AppShell';
import { FirstRunGuard } from '@/components/common/FirstRunGuard';
import { Setup } from '@/pages/Setup';
import { Dashboard } from '@/pages/Dashboard';
import { Income } from '@/pages/Income';
import { Expenses } from '@/pages/Expenses';
import { TaxCalculator } from '@/pages/TaxCalculator';
import { Assets } from '@/pages/Assets';
import { Debt } from '@/pages/Debt';
import { Goals } from '@/pages/Goals';
import { Settings } from '@/pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
        <HouseholdProvider>
          <IncomeProvider>
            <ExpensesProvider>
              <TaxProvider>
                <AssetsProvider>
                  <DebtsProvider>
                    <GoalsProvider>
                      <SnapshotsProvider>
                        <UIStateProvider>
                          <FirstRunGuard>
                            <Routes>
                              <Route path="/setup" element={<Setup />} />
                              <Route element={<AppShell />}>
                                <Route index element={<Dashboard />} />
                                <Route path="/income" element={<Income />} />
                                <Route path="/expenses" element={<Expenses />} />
                                <Route path="/tax" element={<TaxCalculator />} />
                                <Route path="/assets" element={<Assets />} />
                                <Route path="/debt" element={<Debt />} />
                                <Route path="/goals" element={<Goals />} />
                                <Route path="/settings" element={<Settings />} />
                              </Route>
                            </Routes>
                          </FirstRunGuard>
                        </UIStateProvider>
                      </SnapshotsProvider>
                    </GoalsProvider>
                  </DebtsProvider>
                </AssetsProvider>
              </TaxProvider>
            </ExpensesProvider>
          </IncomeProvider>
        </HouseholdProvider>
      </AppDataProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Create `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: Run dev server**

Run: `npm run dev`
Expected: Vite serves at http://localhost:8080. Visiting it lands on `/setup`.

- [ ] **Step 4: Stop dev server, run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors / 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/main.tsx && git commit -m "feat(app): wire providers, routing, first-run guard"
```

---

## Task 21: E2E smoke test passes

**Files:**

- Modify: `tests/smoke.spec.ts`

- [ ] **Step 1: Update smoke test to expect setup page on first run**

```ts
import { test, expect } from '@playwright/test';

test('first-run lands on setup wizard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up your household' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('completes setup and lands on dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('e.g., The Smiths').fill('Test Household');
  await page.getByPlaceholder('Add a name').fill('Alex');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

Run: `npm run test:e2e`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.spec.ts && git commit -m "test(e2e): smoke tests for first-run setup flow"
```

---

## Task 22: Documentation

**Files:**

- Create: `docs/architecture.md`, `docs/invariants.md`

- [ ] **Step 1: Create `docs/architecture.md`**

```markdown
# Architecture

## Provider Hierarchy
```

BrowserRouter
AppDataProvider ← single source of truth; loads from localStorage on mount
HouseholdProvider
IncomeProvider
ExpensesProvider
TaxProvider
AssetsProvider
DebtsProvider
GoalsProvider
SnapshotsProvider
UIStateProvider
FirstRunGuard
Routes

```

## Data Flow

`AppDataProvider` is the **only** writer to `localStorage`. Slice providers expose mutators that call `updateXxxSlice(next)` on `AppDataProvider`, which merges the slice and schedules a 300ms debounced save via `dataRepository.save()`.

## Persistence

- `STORAGE_KEYS` in `src/lib/storageKeys.ts` is the only registry of localStorage keys.
- `safeLocalStorage` in `src/lib/safeStorage.ts` wraps raw localStorage; enforces a 5MB cap on JSON objects (primitives bypass).
- Loads pass through Zod (`AppDataSchema`) and `migrate()` before becoming state. Invalid stored data is treated as missing.
- Migrations live in `src/utils/migrations.ts`; `CURRENT_VERSION` is the target.

## Selectors

Computed values live in `src/lib/finance/selectors.ts` (added in Plan 2). Components consume memoized selectors instead of re-computing.

## Pages

`/setup` — first-run wizard, only path reachable when household has 0 members
`/` — dashboard, headline view
`/income`, `/expenses`, `/tax`, `/assets`, `/debt`, `/goals`, `/settings` — section pages
```

- [ ] **Step 2: Create `docs/invariants.md`**

```markdown
# Invariants

Non-obvious rules that will silently break things if violated.

## 1. Provider order

`AppDataProvider` must wrap every slice provider. Slice providers depend on `useAppData()` to push updates up; ordering is fixed in `src/App.tsx`.

## 2. Single write path

Only `AppDataProvider` writes `AppData` to localStorage. Components and slice providers must never call `dataRepository.save()` directly — go through `updateXxxSlice` callbacks.

## 3. Debounced save tail risk

The 300ms debounce means closing the tab within that window loses the most recent change. Features needing durability must either accept the loss or call a flush helper (not present in v1; add when needed).

## 4. Storage keys are centralized

Every localStorage key lives in `src/lib/storageKeys.ts`. Don't inline new keys in components. Always read/write through `safeLocalStorage`, never raw `localStorage`.

## 5. safeLocalStorage size cap is JSON-objects-only

`safeLocalStorage.setItem` enforces the 5MB cap only on parsed objects. Primitives (`"true"`, `"42"`, plain strings) bypass — preserves single-flag writes.

## 6. AppDataSchema validation on load

Stored data that fails schema validation is treated as missing — `dataRepository.load()` returns `null`. This means an incompatible upgrade falls back to defaults rather than crashing. Always migrate first, then validate.

## 7. First-run guard

`FirstRunGuard` redirects to `/setup` whenever `household.members.length === 0`. Don't add code paths that mount AppShell with no members.

## 8. Member ID stability

Member IDs come from `crypto.randomUUID()` and must never change after creation. Income, expenses, assets, debts reference them. Renaming a member edits `member.name`; never reissues `member.id`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ && git commit -m "docs: add architecture and invariants"
```

---

## Task 23: Final gate — typecheck, lint, vitest, playwright all green

- [ ] **Step 1: Run full gate**

Run: `npm run typecheck && npm run lint && npm test -- --run && npm run test:e2e`
Expected: all green.

- [ ] **Step 2: Tag the foundation milestone**

```bash
git tag plan-1-foundation && echo "Plan 1 complete"
```

---

## Self-Review

- **Spec coverage:** §2 stack ✓ Task 1–6. §4 data model ✓ Task 7. §7 provider hierarchy ✓ Task 13–14. §8 import deferred to Plan 4 ✓. §10 testing scaffold ✓ Task 3, 6. §12 .gitignore ✓ Task 1.
- **Placeholders:** none.
- **Type consistency:** `AppData`, `Member`, `MemberIncome`, `Expense`, `SplitRule`, `Snapshot` all defined in Task 7 and consumed identically in Tasks 8–14.
