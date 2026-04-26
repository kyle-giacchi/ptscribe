# Money Coast — UI/UX Style Guide (v0.1)

Living document. The goal of this app is to **lower the cognitive and emotional cost of looking at your money.** Everything here should reduce stress, not perform competence. When a choice is ambiguous, pick the calmer option.

---

## 1. Design Principles

1. **Calm beats clever.** No alarming reds, no urgent badges, no shouting numbers. Money is already loud; the UI should be quiet.
2. **One hero per screen.** Each page has a single dominant figure (Guilt-Free, Net Worth, etc.) rendered in the warm accent. Everything else recedes into the cool ground.
3. **Motion as reassurance, not decoration.** Transitions confirm "your data moved here," not "look how smooth I am." Default to short, eased fades and translates. No bounce, no spring overshoot on financial figures.
4. **Soft edges everywhere.** Generous radii, subtle shadows, translucent layers. Nothing should feel like it could cut you.
5. **Whitespace is a feature.** A sparse dashboard reads as control. A dense one reads as anxiety.

---

## 2. Color System

The palette is a **cool/warm split**: cool gray-blues hold the room; a single warm orange marks the numbers that matter. Add new colors only when a semantic role demands it — never for decoration.

### 2.1 Tokens (OKLCH, drop into `src/index.css` `@theme`)

```css
/* Ground — soft gray-blue */
--color-bg:           oklch(0.985 0.008 240);  /* page background, near-white with blue cast */
--color-surface:      oklch(0.97  0.012 240);  /* cards, panels */
--color-surface-2:    oklch(0.945 0.016 240);  /* nested surfaces, hovered rows */
--color-border:       oklch(0.90  0.020 240);  /* hairlines, dividers */
--color-border-soft:  oklch(0.93  0.015 240);  /* internal table rules */

/* Text */
--color-fg:           oklch(0.28  0.030 250);  /* primary copy — blue-tinted near-black */
--color-fg-muted:     oklch(0.50  0.025 245);  /* secondary copy, captions */
--color-fg-subtle:    oklch(0.65  0.020 245);  /* placeholders, disabled */

/* Accent — soft orange (the money color) */
--color-accent:       oklch(0.78  0.13  60);   /* primary accent — warm, not neon */
--color-accent-soft:  oklch(0.92  0.06  65);   /* tinted backgrounds, chips */
--color-accent-fg:    oklch(0.30  0.08  50);   /* text on accent-soft */
--color-accent-deep:  oklch(0.62  0.16  55);   /* hover/active state for accent surfaces */

/* Semantic — all desaturated to fit the calm palette */
--color-positive:     oklch(0.72  0.10 165);   /* gains, on-track — sage, not green */
--color-caution:      oklch(0.80  0.10  85);   /* warnings — pale amber, distinct from accent */
--color-negative:     oklch(0.62  0.12  25);   /* over-budget — terracotta, never red */
--color-info:         oklch(0.70  0.07 235);   /* informational — slate blue */

/* Effects */
--shadow-sm:  0 1px 2px oklch(0.30 0.03 250 / 0.04);
--shadow-md:  0 4px 16px -4px oklch(0.30 0.03 250 / 0.08);
--shadow-lg:  0 12px 32px -8px oklch(0.30 0.03 250 / 0.10);

/* Radii — soft */
--radius-sm: 0.5rem;
--radius:    0.75rem;
--radius-lg: 1rem;
--radius-xl: 1.5rem;  /* hero cards */
```

### 2.2 Usage rules

- **Accent orange is reserved for hero figures and primary CTAs.** If three things on a screen are orange, two of them are wrong.
- **Never pair `--color-negative` with bold weight.** Keep over-budget figures in regular weight; the color does the work.
- **Borders should be felt, not seen.** Prefer `border-soft` inside cards; reserve `border` for the card edge itself.
- **No pure white, no pure black.** Every neutral has a blue cast — that's the whole vibe.

---

## 3. Typography

A distinctive serif for hero figures (warm, editorial, slightly human) paired with a quiet geometric sans for everything else. Avoid Inter/Roboto/system defaults — they read as generic SaaS.

### 3.1 Pairing

- **Display & numerals:** [Fraunces](https://fonts.google.com/specimen/Fraunces) — variable serif. Use `opsz` 96+ for hero figures, `wght` 400, `SOFT` 100 for the rounded variant. Tabular numerals (`font-feature-settings: "tnum"`) on every dollar amount.
- **Body & UI:** [Manrope](https://fonts.google.com/specimen/Manrope) or [Geist](https://vercel.com/font) — pick one and stick with it. Weight 400 for body, 500 for labels, 600 sparingly.
- **Mono (future, for snapshots/diffs):** [JetBrains Mono](https://www.jetbrains.com/lp/mono/) at 0.85em.

### 3.2 Scale

| Role             | Size / Line height | Weight | Notes                                |
| ---------------- | ------------------ | ------ | ------------------------------------ |
| Hero figure      | 64–80px / 1.0      | Fraunces 400 | Tabular nums; orange; never abbreviated |
| Page title       | 28px / 1.2        | Fraunces 500 | One per page                         |
| Section title    | 18px / 1.3        | Manrope 600  | Sentence case, never ALL CAPS        |
| Body             | 15px / 1.55       | Manrope 400  | Default reading size                 |
| Label / caption  | 13px / 1.4        | Manrope 500  | `--color-fg-muted`                   |
| Tabular figure   | 15px / 1.4        | Manrope 500  | `tnum` always on for any $ amount    |

### 3.3 Rules

- Currency in body context uses `formatMoney` and the body font with tabular numerals.
- Hero figures (Guilt-Free, Net Worth, Total Debt) use Fraunces. The serif itself is the visual reward.
- No uppercase tracked-out labels. They feel corporate; we are intimate.

---

## 4. Motion

React-driven motion is the second-biggest lever after color. Use the [`motion`](https://motion.dev/) library (formerly Framer Motion) — it's built for React 19 and supports the `<AnimatePresence>` patterns we'll need for list/dialog transitions.

### 4.1 Timing scale

```ts
export const ease = {
  standard: [0.32, 0.08, 0.24, 1],   // Material-ish, calm
  enter:    [0.16, 0.84, 0.44, 1],   // decelerate — for entering elements
  exit:     [0.4,  0.0,  1,    1],   // accelerate — for exiting elements
} as const;

export const duration = {
  instant: 0.12,  // hover color shifts, focus rings
  quick:   0.2,   // small UI: chips, buttons, dropdown items
  base:    0.32,  // default — cards, dialogs, route content
  slow:    0.5,   // hero figures, dashboard reveal
  hero:    0.8,   // page-load orchestration only
} as const;
```

### 4.2 Patterns

| Pattern                        | Recipe                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- |
| **Page enter**                 | Fade + 8px translate-y, `duration.base`, `ease.enter`. Stagger children 40ms. |
| **Hero figure mount**          | Fade + scale `0.96 → 1`, `duration.slow`, `ease.enter`. Number itself counts up (see 4.3). |
| **List add/remove**            | `<AnimatePresence>` + layout animation. Enter: opacity 0→1 + translate-y 6px. Exit: opacity + height collapse. |
| **Dialog**                     | Backdrop fades `duration.quick`. Panel scales `0.97 → 1` + fades, `duration.base`. |
| **Tab / route change**         | Crossfade only (no slide). `duration.quick`. |
| **Hover on interactive surface** | Background shift only, `duration.instant`. No translate, no scale. |
| **Focus ring**                 | 2px outline, `--color-accent` at 50% opacity, `duration.instant`. |

### 4.3 Counting up financial figures

Hero numbers (Guilt-Free, Net Worth) animate from previous → new value over `duration.slow`, easing `enter`. Use a small hook (`useAnimatedNumber`) backed by `motion`'s `useMotionValue` + `animate()`. **Skip the animation if the delta is < 1% of the previous value** — micro-twitches feel jittery and anxious.

### 4.4 What NOT to do

- ❌ Spring physics on dollar amounts (overshoot reads as "wrong number flickered")
- ❌ Parallax, scroll-driven 3D, or anything performative
- ❌ Loading spinners — prefer skeleton shimmers in `--color-surface-2`
- ❌ Notification toasts that slide aggressively. Fade in, sit briefly, fade out.
- ❌ `prefers-reduced-motion`: all of the above must collapse to opacity-only fades at `duration.quick`.

---

## 5. Spacing & Layout

- **8-pt grid.** All padding, margins, gaps in multiples of 4 (with 8 as the base unit).
- **Card padding:** 24px (`p-6`) standard; 32px (`p-8`) for hero cards.
- **Section gap:** 32px between unrelated card groups; 16px within a group.
- **Max content width:** 1200px on dashboard; 720px on settings/forms — narrow column reads as personal.
- **Dashboard layout:** asymmetric is fine. Hero card spans 2 columns; supporting cards single. Don't force a perfect grid.

---

## 6. Components — conventions

These extend, not replace, the shadcn primitives already in the project.

### Cards
- Always `--color-surface` background, `--color-border` 1px, `--shadow-sm`, `--radius-lg`.
- Hero cards: `--radius-xl`, `--shadow-md`, optional 1px inner highlight (`box-shadow: inset 0 1px 0 white/40%`).

### Buttons
- **Primary:** `--color-accent` background, `--color-accent-fg` text, `--radius`. Hover → `--color-accent-deep`.
- **Secondary:** `--color-surface-2` background, `--color-fg` text, hairline border.
- **Ghost:** transparent, `--color-fg-muted` text, surface tint on hover.
- All buttons: `duration.quick` background + color transition.

### Inputs
- `--color-surface` background, `--color-border-soft` 1px border. On focus: border becomes `--color-accent` at 60% opacity, no harsh ring.
- Labels above, never floating labels (financial data is too important to obscure).

### Numbers in tables
- Tabular nums, right-aligned, `--color-fg`. Negative values use `--color-negative` (terracotta, regular weight). No parentheses or minus prefixes — color carries the sign.

### Empty states
- One short sentence (`--color-fg-muted`) + one ghost CTA. No illustrations in v1; they'd compete with the calm.

---

## 7. Accessibility

- Body text contrast ≥ 7:1 against `--color-bg` (we're easily clearing this with the chosen `--color-fg`).
- Accent orange on white must only be used at 18px+ or bold — verify with [APCA](https://www.myndex.com/APCA/). For body-size accent, use `--color-accent-deep`.
- Focus visible on every interactive element, no exceptions.
- Honor `prefers-reduced-motion` (see §4.4).
- All semantic colors must also be distinguishable by position or icon, never color alone.

---

## 8. Open questions for next pass

- Dark mode? Likely yes — same accent, inverted ground. Defer to v0.2.
- Charts: pick a library (Recharts vs Visx vs hand-rolled SVG) and define a series color ramp from `--color-info` → `--color-accent`.
- Iconography: Lucide is fine as a base, but consider a custom set for the 6 expense categories so the dashboard has a memorable visual signature.
- Sound? Subtle, optional confirmation tones on snapshot save? (Probably no, but worth a brainstorm.)
