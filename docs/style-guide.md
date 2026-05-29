# PTScribe — UI/UX Style Guide

Living document. Design goal: a clinical tool that feels calm and professional — never alarming, never distracting. Physical therapists are using this mid-session or immediately after; every visual choice should reduce friction, not add it.

---

## 1. Design Principles

1. **Clinical calm.** No neon, no aggressive reds at rest, no urgency theater. Clinicians are already dealing with real stress; the UI shouldn't add to it.
2. **One action per moment.** Each screen has a primary action. Secondary controls recede visually. Never compete for attention.
3. **Frame layout.** The app lives inside a dark navy frame (`--color-pt-bg`) with a light interior. The dark border creates a stable "device" feel; the white surface inside is the working area.
4. **Soft edges everywhere.** Generous radii, subtle shadows, no hard corners. The palette has no pure white or pure black — every neutral has a slight blue-gray cast.
5. **Dark mode first-class.** Light and dark modes are equally supported. Design decisions should work in both. Theme is controlled by `data-theme="dark"` on `<html>`, set by `SettingsProvider`.

---

## 2. Color System

Two-layer palette: **surfaces** (cool blue-gray) frame **accents** (cyan-teal for primary action, semantic colors for status). All tokens use `--color-pt-*` names; the `--color-*` aliases exist for legacy compatibility and will be removed.

### 2.1 Token reference (light mode defaults)

```css
/* Surfaces */
--color-pt-bg: #1a2030 /* outer dark frame */ --color-pt-surface: #ffffff
  /* card / header background */ --color-pt-surface-alt: #f4f6f9 /* app canvas (body background) */
  --color-pt-surface-mut: #fafbfc /* integrity strips, list rows */ --color-pt-border: #e4e8ee
  /* standard borders */ --color-pt-border-strong: #d6dce5 /* Text */ --color-pt-text: #1a2030
  /* primary — same hue as the frame */ --color-pt-text-2: #5a6577 /* secondary / labels */
  --color-pt-text-3: #8893a5 /* placeholder / subtle */ /* Accent — cyan-teal */
  --color-pt-accent: #0ea5a8 /* primary CTAs, active states */ --color-pt-accent-soft: #e6f7f6
  /* tinted chip backgrounds */ --color-pt-accent-border: #9fdcdc --color-pt-accent-fg: #0a6d70
  /* text on accent-soft; hover bg for btn-primary */ /* Semantic — red */ --color-pt-red: #dc2942
  --color-pt-red-soft: #fdecee --color-pt-red-border: #f5b8bf --color-pt-red-fg: #9b1d2e
  /* Semantic — amber */ --color-pt-amber: #c47a09 --color-pt-amber-soft: #fdf3df
  --color-pt-amber-border: #f0d495 --color-pt-amber-fg: #7a4c04 /* Semantic — violet */
  --color-pt-violet: #6f5acc /* info, AI-related states */ --color-pt-violet-soft: #eeebfa
  --color-pt-violet-border: #cfc6ee --color-pt-violet-fg: #4a3aa3 /* Semantic — slate */
  --color-pt-slate: #7c8699 /* neutral pills, secondary status */ --color-pt-slate-soft: #f1f3f7
  --color-pt-slate-border: #dde2ea --color-pt-slate-fg: #374055;
```

### 2.2 Usage rules

- **Cyan-teal is the one primary action color.** If three things on a screen are teal, two of them are wrong.
- **Red is for errors and destructive confirmations only** — not for warnings or neutral cautions. Amber handles cautions.
- **Violet signals AI-related activity** (generating, transcribing, recording spinner). Consistent use builds a mental model.
- **Never reach for `--color-pt-bg` (the dark navy) inside the app surface** — it belongs on the outer frame only.
- **Use `--color-pt-border`** for card edges; `--color-pt-border-strong` for inputs on focus. Don't invent custom border colors.

---

## 3. Typography

Single typeface throughout: **Inter**. It's neutral, legible at clinical distances, and renders well on both Mac Retina and low-DPI Windows.

```css
--font-sans:
  'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
  sans-serif --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas,
  monospace --font-display: 'Inter'
    /* same family; .font-display adds weight 600 + -0.02em tracking */;
```

### 3.1 Scale

| Role            | Size    | Weight | Notes                                             |
| --------------- | ------- | ------ | ------------------------------------------------- |
| Page title      | 20–24px | 600    | `.font-display`; one per page                     |
| Section heading | 15–16px | 600    | Sentence case; never ALL CAPS                     |
| Body            | 14–15px | 400    | Default reading size                              |
| Label / caption | 12–13px | 500    | `--color-pt-text-2`                               |
| Timer / ID      | any     | 400    | `.tnum` — tabular numerals; `.font-mono` if fixed |
| Button          | 14px    | 500    | Via `.btn` — don't override                       |

### 3.2 Rules

- **Tabular numerals on any elapsed time or count.** Use `.tnum` class (maps to `font-variant-numeric: tabular-nums`).
- No uppercase tracked-out labels — they read as institutional, not clinical.
- Mono font is for timers, IDs, and code blocks only — not for emphasis or decoration.

---

## 4. Motion

The app uses [`motion/react`](https://motion.dev/) (Framer Motion) as its animation library — use it freely to make the interface feel polished and alive. CSS transitions remain a fine choice for simple state changes (hover, focus rings, color shifts) where reaching for JS would be overkill.

**Honor `prefers-reduced-motion`.** Users who set the OS "reduce motion" flag (often for vestibular conditions) should get opacity-only fades instead of movement. `motion/react`'s [`useReducedMotion()`](https://motion.dev/docs/react-accessibility) hook makes this nearly free — gate transforms behind it.

### 4.1 Timing reference

Sensible starting points, not rules — adjust per interaction:

```css
/* Button hover / focus ring */
transition:
  background-color 120ms ease-out,
  color 120ms ease-out,
  border-color 120ms ease-out;

/* Sidebar slide, modal enter */
transition:
  transform 200ms ease-out,
  opacity 200ms ease-out;

/* Toast fade */
transition: opacity 150ms ease-in;
```

---

## 5. Spacing & Layout

- **4-pt grid.** All padding, gap, and margin values should be multiples of 4 px (`1`, `1.5`, `2`, `3`, `4`, `6`, `8` in Tailwind rem units).
- **Touch targets: 44px minimum.** The `.btn` class enforces `min-h-[44px]`. Never shrink below this for interactive elements.
- **Card padding:** `p-6` (24px) standard; `p-8` (32px) for hero cards (`.card-hero`).
- **GlobalTopNav** is the only persistent app chrome (height 52 px). The dashboard is the only route that adds a left `Sidebar` rail; everywhere else the page renders directly under the top nav.
- **Session chrome:** `SessionTopBar` (height 56 px) sits beneath `GlobalTopNav` on `/sessions/:id` and owns the per-session breadcrumb, AddClip button, Audio clips toggle, and Sign & export action. Session content uses two tabs only (`record`, `review`).

### Responsive defaults

| Breakpoint      | Component           | Behavior                                                                                              |
| --------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `< 1024 px`     | `GlobalTopNav`      | Horizontal nav collapses to a hamburger overflow menu.                                                |
| `< 1024 px`     | `TranscriptPanel`   | Auto-collapses on Review tab (`useBelowBreakpoint(1024)`); reopens via `TranscriptCollapsedTab` rail. |
| `< 768 px` (md) | Dashboard `Sidebar` | Hides the rail and adds a hamburger drawer with overlay + slide-in.                                   |
| `< 768 px`      | `ClipsDrawer`       | Renders as a bottom sheet (80 vh, safe-area padding) instead of a right-side 380 px drawer.           |

All dismissable surfaces (overflow menus, `ClipsDrawer`, search results, alerts) close on Escape and outside-click via the shared `useDismissable` hook.

---

## 6. Components

### 6.1 Card variants

```css
.card      /* rounded-xl, p-6, surface bg, border, shadow-sm */
.card-hero /* rounded-2xl, p-8, surface bg, shadow-md, inner highlight at top */
```

Do not add inline `border-radius` to card-like containers — use `.card` or `.card-hero`.

### 6.2 Button variants

```css
.btn          /* base: 44px min-height, flex, rounded-lg, 14px, 500 weight */
.btn-primary  /* cyan-teal bg (#0ea5a8), white text; hover → accent-fg */
.btn-secondary /* surface-mut bg, text, border */
.btn-ghost    /* transparent, text color; surface tint on hover */
.btn-danger   /* red bg, white text */
```

Combine size modifiers (`py-0.5 text-xs`) for compact inline buttons only — the full `.btn` height is required for standalone actions.

### 6.3 Inline confirmation pattern

Never use `window.confirm()`. Destructive actions reveal an inline caution banner with `AlertTriangle` icon, a cancel button, and a confirm button. The guard state (`pendingDelete`, `pendingOverwrite`, etc.) is local `useState`. See `invariants.md#destructive-actions-use-inline-confirmation` for the exact markup pattern.

### 6.4 Error boundary

`src/components/common/ErrorBoundary.tsx` wraps the entire app. On an uncaught render error it shows a centered "Something went wrong — reload" card. Do not add nested error boundaries unless a component genuinely needs isolated failure (e.g., a third-party widget). The boundary logs to `console.error`.

### 6.5 Toast notifications

Toasts use the `sonner` library via `<Toaster>` in `AppShell`. Call `toast.success()`, `toast.error()`, `toast.warning()` from hooks or event handlers — never from render. Do not add a second toast system.

---

## 7. Semantic color usage guide

| Situation                            | Color token            | Example                                  |
| ------------------------------------ | ---------------------- | ---------------------------------------- |
| Primary CTA, active nav item         | `pt-accent`            | Save, Start recording                    |
| AI in progress (transcribing, gen)   | `pt-violet`            | Generating note… spinner                 |
| Success / completed                  | `pt-accent` (positive) | Transcription ready                      |
| Caution / non-critical warning       | `pt-amber`             | "Session was backgrounded — verify time" |
| Error / failed / destructive confirm | `pt-red`               | "Transcription failed", delete confirm   |
| Neutral badge / status               | `pt-slate`             | "Draft", "Pending"                       |

---

## 8. Accessibility

- Body text contrast ≥ 4.5:1 against surface background in both light and dark modes.
- Every interactive element must have a visible focus ring — do not remove `outline` globally.
- Accent cyan on white: verify with APCA at body size (< 18px). Use `--color-pt-accent-fg` for small text on `--color-pt-accent-soft` backgrounds.
- All semantic color usage must also communicate via icon or label — never by color alone.
- `autoFocus` on modal close buttons and confirmation cancel buttons (prevents keyboard trap).
- Minimum 44px touch target on all interactive elements.
