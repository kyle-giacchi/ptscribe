---
name: PTScribe
description: A clinical scribe for physical therapists — calm, precise, and out of the way.
colors:
  clinical-teal: '#0ea5a8'
  clinical-teal-soft: '#e6f7f6'
  clinical-teal-border: '#9fdcdc'
  clinical-teal-fg: '#0a6d70'
  outer-backdrop: '#1a2030'
  surface: '#ffffff'
  surface-alt: '#f4f6f9'
  surface-mut: '#fafbfc'
  border: '#e4e8ee'
  border-strong: '#d6dce5'
  text: '#1a2030'
  text-2: '#5a6577'
  text-3: '#8893a5'
  alert-red: '#dc2942'
  alert-red-soft: '#fdecee'
  alert-red-border: '#f5b8bf'
  alert-red-fg: '#9b1d2e'
  caution-amber: '#c47a09'
  caution-amber-soft: '#fdf3df'
  caution-amber-border: '#f0d495'
  caution-amber-fg: '#7a4c04'
  info-violet: '#6f5acc'
  info-violet-soft: '#eeebfa'
  info-violet-border: '#cfc6ee'
  info-violet-fg: '#4a3aa3'
  neutral-slate: '#7c8699'
  neutral-slate-soft: '#f1f3f7'
  neutral-slate-border: '#dde2ea'
  neutral-slate-fg: '#374055'
  landing-bg: 'oklch(97.5% 0.008 185)'
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 600
    letterSpacing: '-0.02em'
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 400
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '10.5px'
    fontWeight: 600
    letterSpacing: '1.2px'
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
rounded:
  sm: '4px'
  base: '5px'
  md: '6px'
  lg: '7px'
  xl: '8px'
  2xl: '10px'
  card: '14px'
spacing:
  xs: '6px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.clinical-teal}'
    textColor: '#ffffff'
    rounded: '{rounded.xl}'
    padding: '9px 14px'
  button-primary-hover:
    backgroundColor: '{colors.clinical-teal-fg}'
  button-ghost:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.xl}'
    padding: '8px 12px'
  button-danger:
    backgroundColor: '{colors.alert-red}'
    textColor: '#ffffff'
    rounded: '{rounded.xl}'
    padding: '8px 14px'
  button-accent-soft:
    backgroundColor: '{colors.clinical-teal-soft}'
    textColor: '{colors.clinical-teal-fg}'
    rounded: '{rounded.xl}'
    padding: '8px 12px'
  card-surface:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
  input-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.xl}'
    padding: '8px 12px'
---

# Design System: PTScribe

## Overview

**Creative North Star: "The Quiet Clinic"**

PTScribe's visual system is a calm, well-run clinic room, not a hospital ward and not a consumer wellness app. Surfaces are white and near-silent; a single clinical teal marks the one thing that matters on a screen — a live recording, a primary action, a confirmed state. Everything else recedes into a tight neutral scale (near-black text, slate-grey secondary text, barely-there borders) so the clinician's eye lands on content, not chrome. Depth is minimal and functional: a hairline border and a whisper of shadow separate a card from the page, never a heavy drop shadow performing importance.

The system explicitly rejects both directions PRODUCT.md warns against: it is not the dense blue-grey form-grid of a legacy EHR, and it is not the pastel, rounded-bubble softness of a consumer health app. Corners are gently rounded (4–14px) — present enough to feel human, restrained enough to stay clinical. Type is a single family (Inter) carrying the whole hierarchy through weight and size alone, so nothing about the interface asks to be learned.

Dark mode is a first-class second state, not an afterthought: the same roles (surface, text, teal accent, semantic reds/ambers/violets) invert into a near-black hierarchy with softened, darker-toned semantic fills — same relationships, same restraint.

**Key Characteristics:**

- One accent color (clinical teal), reserved for primary actions and "live" states
- Flat-by-default surfaces; shadow only at hairline strength, used structurally not decoratively
- Single type family (Inter) driving hierarchy via weight/size/letter-spacing, not font-switching
- Small, consistent radius scale (4–14px) — rounded enough to be warm, never bubbly
- Semantic color roles (red/amber/violet/slate) always paired with a soft-fill + border + foreground triad, never a bare hue
- Full parallel dark theme via the same token roles, not an inverted filter

## Colors

The palette is a near-monochrome neutral scale with exactly one accent color and four muted semantic colors, each expressed as a soft-fill/border/foreground triad rather than a single saturated hue.

### Primary

- **Clinical Teal** (`#0ea5a8`): The system's only accent. Used for the primary CTA, active/live states (recording indicator, focus rings), and links. Appears sparingly — most screens show it in exactly one or two places (a primary button, a status dot). Soft fill `#e6f7f6` / border `#9fdcdc` / foreground `#0a6d70` for badges and accent-soft buttons.

### Neutral

- **Outer Backdrop** (`#1a2030`): The dark frame surrounding the app shell on entry pages (Landing, Login, Setup) — the "room" the clinic sits inside.
- **Surface** (`#ffffff`): Cards, panels, the app header — the primary working surface.
- **Surface Alt** (`#f4f6f9`): The app canvas behind cards, distinguishing "page" from "card."
- **Surface Muted** (`#fafbfc`): List rows, integrity strips — a whisper-thin step below Surface.
- **Border** (`#e4e8ee`) / **Border Strong** (`#d6dce5`): Hairline dividers; Strong reserved for emphasis (focused sections, dividers that need to read at a glance).
- **Text** (`#1a2030`), **Text 2** (`#5a6577`), **Text 3** (`#8893a5`): Primary / secondary / tertiary text — three steps, no more. Text 3 is for timestamps, placeholder copy, disabled labels.

### Semantic (soft-fill / border / foreground triads)

- **Alert Red** (`#dc2942`, soft `#fdecee`, border `#f5b8bf`, fg `#9b1d2e`): Errors, destructive actions, pain-related clinical tags.
- **Caution Amber** (`#c47a09`, soft `#fdf3df`, border `#f0d495`, fg `#7a4c04`): Warnings, staleness indicators, home-exercise-program tags.
- **Info Violet** (`#6f5acc`, soft `#eeebfa`, border `#cfc6ee`, fg `#4a3aa3`): Informational states, strength-related clinical tags.
- **Neutral Slate** (`#7c8699`, soft `#f1f3f7`, border `#dde2ea`, fg `#374055`): Inactive/neutral pills, generic notes tags.

### Named Rules

**The One Accent Rule.** Clinical Teal is the only saturated, high-chroma color used for interactive emphasis. Every other color in the system is either a near-neutral gray or a muted semantic triad. If a screen needs a second "loud" color, it's a sign the hierarchy is unclear, not that the palette needs another accent.

**The Triad Rule.** A semantic color never appears as a single hue. It's always soft-fill background + matching border + darker foreground text, together — this is what keeps amber/red/violet legible and calm instead of alarming.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui fallback)
**Body Font:** Inter (with -apple-system, "Segoe UI", Roboto fallback)
**Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo, Consolas fallback) — timers, IDs, tabular counts

**Character:** One family carries everything. Hierarchy comes from weight and negative letter-spacing on display text (600 weight, -0.02em), not from switching typefaces — this is what keeps the interface feeling like one calm voice rather than a magazine layout.

### Hierarchy

- **Display** (600, tight -0.02em tracking): Page titles, hero headings on entry pages. `.font-display` utility.
- **Title/Section** (600, default tracking): Card headers, section labels.
- **Body** (400, ~14px, 1.55 line-height): Default UI text, note content, form labels.
- **Label** (600, 10.5px, 1.2px letter-spacing, uppercase): Eyebrow labels, tag kind labels (e.g. "ROM", "HEP") — always uppercase, always the smallest text in the system.
- **Mono/Tabular** (`.tnum` / `.font-mono`): Timers, recording duration, numeric IDs — always tabular-nums so digits don't jitter.

### Named Rules

**The Single-Voice Rule.** Never introduce a second font family. If a component needs to feel distinct (a timer, a code-like ID), reach for JetBrains Mono and tabular-nums, not a new display face.

## Layout

The app shell is a two-column grid: a fixed ~220px sidebar and a fluid content column on desktop (`≥768px`); the sidebar collapses to a mobile drawer below that breakpoint, with the primary nav and global search hidden below 1024px/768px respectively in favor of the sidebar/drawer pattern. Entry pages (Landing, Login, Setup, AuthCallback) use a distinct framed-card-on-dark-backdrop layout: a light card floats on the dark Outer Backdrop surface, giving those pages a "focused workspace" feel separate from the logged-in app chrome.

Spacing follows a tight rhythm keyed to small increments (6/8/12/16/24px) rather than a loose 8pt-only grid — compact controls (chips, tags) use 5–10px padding; cards and sections step up to 16–24px. Density stays on the "comfortable, not sparse" side: this is a between-patients tool, not a leisurely reading surface.

## Elevation & Depth

Flat by default, with hairline shadows used structurally, never decoratively. Cards are distinguished from the page primarily by background-color contrast (Surface vs Surface Alt) and a 1px border; shadow is a secondary, low-intensity cue.

### Shadow Vocabulary

- **sm** (`0 1px 2px rgba(26,32,48,0.06)`): Default card elevation — barely perceptible, just enough to lift a card off the page.
- **md** (`0 4px 12px -2px rgba(26,32,48,0.08)`): Elevated cards, dropdowns.
- **lg** (`0 12px 30px rgba(0,0,0,0.18)`): Modals, floating panels.
- **banner** (`0 18px 50px rgba(26,32,48,0.18), 0 2px 6px rgba(26,32,48,0.06)`): The framed hero card on entry pages — the one place a more theatrical shadow is earned.

### Named Rules

**The Flat-By-Default Rule.** Nothing gets a shadow just to look "important." Shadow strength scales with actual z-order (page → card → dropdown → modal), and the card level stays close to imperceptible.

## Shapes

A small, consistent radius scale (4–14px) rather than sharp corners or fully rounded pill shapes. Buttons and inputs sit at 8px; small chips and tags at 6–9px; section cards at 6–7px; outer dashboard cards and the app's outer frame step up to 8–10px; the largest hero/hint card uses 14px. Borders are hairline (1px) and low-contrast — corners and borders read as structure, not decoration. Status dots (recording indicator, tag-kind markers) are the one fully-circular shape in the system, reserved for "this is live / this is a category."

## Components

### Buttons

- **Shape:** 8px radius (`--radius-xl`) across all variants; 44px minimum touch height on the CSS-class `.btn` variants.
- **Primary:** Clinical Teal background, white text, no border, 9px/14px padding, 600 weight, 13px text. Hover darkens to the teal-fg tone.
- **Ghost:** Surface background, Text color, 1px Border — the default, low-emphasis variant. Hover fills to Surface Muted.
- **Danger:** Alert Red background, white text — destructive actions only.
- **Accent-soft:** Clinical-teal-soft background with teal-border and teal-fg text — a lower-emphasis alternative to full Primary, used where teal is appropriate but the action isn't the single primary CTA.
- **Disabled:** 0.5 opacity, `not-allowed` cursor, applied uniformly across variants.

### Chips / Tags

- **TagChip:** soft-fill background + matching border + a small (6px) solid dot in the semantic hue + an uppercase uppercase-label pill (10.5px, 600 weight, 1.2px tracking) + optional freeform text, all in one pill at 7px radius.
- **QuickTagButton:** a full-width row variant of the same semantic-dot pattern, Surface background with Border, used as a tappable list item rather than an inline pill.

### Cards / Containers

- **Corner Style:** 14px default (SurfaceCard), 6–8px for the CSS `.card` / `.card-hero` utility classes depending on hero vs. standard.
- **Background:** Surface (white) by default; Surface Muted when `muted` is set (e.g. nested/inset content).
- **Shadow Strategy:** sm for `.card`, md (plus an inset top highlight) for `.card-hero`.
- **Border:** 1px Border color, omit-able via a `bordered={false}` prop for edge-to-edge contexts.

### Inputs / Fields

- **Style:** Surface background, 1px Border, 8px radius, 14px (16px on mobile to avoid iOS auto-zoom).
- **Focus:** Border shifts to Clinical Teal plus a 3px soft teal glow ring (`rgba(14,165,168,0.22)`) — no layout shift, pure color/glow change.
- **Placeholder:** Text-3 (the lightest text tone).

### Navigation

- Sidebar-driven on desktop (~220px fixed column), collapsing to a drawer with a dark scrim overlay (`--color-pt-overlay`) below 768px. Primary nav row hides below 1024px in favor of the sidebar; global search input hides below 768px in favor of the mobile drawer's own affordance.

### Status Dot (signature component)

A small solid-color circle (6–8px) used two ways: as the colored marker inside a TagChip/QuickTagButton (static, semantic-hue), and as a "live" indicator with a two-part animated pulse — a calm outward-scaling ring (`pts-pulse-calm` / `pts-pulse`) for ambient live states, and a sharper two-beat "heartbeat" scale (`pts-heartbeat`) specifically for the active-recording dot. This is the one place the system allows motion to carry meaning on its own.

## Do's and Don'ts

### Do:

- **Do** keep Clinical Teal to one primary action or live-state indicator per screen.
- **Do** express every semantic color as the soft-fill/border/foreground triad, never a bare saturated hue.
- **Do** use tabular-nums (`.tnum`/`.font-mono`) for any numeral that updates live (timers, counts) so digits don't jitter.
- **Do** respect `prefers-reduced-motion` — all transitions collapse to ~120ms and animations to near-zero duration.
- **Do** keep the radius scale within 4–14px; nothing sharp, nothing pill-shaped except status dots.

### Don't:

- **Don't** add a second saturated accent color — route it through one of the four existing muted semantic roles instead.
- **Don't** add drop shadows for visual weight; shadow strength must track actual z-order (page < card < dropdown < modal).
- **Don't** introduce a second type family; use JetBrains Mono + tabular-nums for numeric/timer contexts instead of a new display face.
- **Don't** let entry-page (dark backdrop, framed card) treatment bleed into the logged-in app shell, or vice versa — they are deliberately distinct registers.
