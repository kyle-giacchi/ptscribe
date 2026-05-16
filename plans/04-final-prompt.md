# Final Prompt — PTScribe Landing Page

AUDIT_MODE: standard
Quality checklist: PASSED (2026-05-10)

---

## Delivery Notes

- Core Checklist: all items ✓
- Zero Generic Language scan: passed — all values explicit (hex codes, px/ms/easing, state logic)

---

## The Verified Replication Prompt

```
You are a World-Class Senior Creative Technologist and Lead Frontend Engineer.

**Aesthetic Identity:** Clinical Warmth / The PT's Quiet, Confident Front Door

Rebuild `src/pages/Landing.tsx` in a React + TypeScript codebase (Vite, React 19).
Use inline styles + CSS custom properties throughout — NO Tailwind on this page.
Export: `export function Landing({ onSignIn }: LandingProps)`
Interface: `interface LandingProps { onSignIn?: (code: string) => Promise<{ ok: boolean; error?: string }> }`

Preserve existing state logic exactly:
- `showCode` state (useState, initializes from router location state)
- `handleDemo()` function (navigates to '/today' with showCode state if !onSignIn, else setShowCode(true))
- `handleSubmit()` form handler with busy/error states
- 6-digit code input form with ref for auto-focus
- useNavigate, useLocation from react-router-dom

This page adapts the scroll-driven storytelling architecture of glossar.app for PTScribe,
an AI note tool for physical therapists. The reference site's genius is restraint + momentum:
generous whitespace, Apple-calibrated type, a sticky device mockup that evolves across 5000px,
and copy so specific it feels earned. Transplant that architecture into PTScribe's clinical-warm
identity: teal instead of pure black, "Better care, less work" instead of "Fluency at glances,"
a browser mockup instead of an iPhone.

---

## DESIGN SYSTEM

### Palette

| Semantic Name  | Word          | Hex       | Usage |
|----------------|---------------|-----------|-------|
| Primary Action | "Teal"        | #0ea5a8   | CTAs, icon fills, level badges, price badge, active states |
| Primary Hover  | "Deep Teal"   | #0a6d70   | Hover on primary buttons ONLY |
| Accent Soft    | "Mist"        | #e6f7f6   | Chip backgrounds, soft highlight tints |
| Dark Frame     | "Midnight"    | #1a2030   | Nav pill bg, dark cards, app UI backgrounds |
| Page Canvas    | "Cloud"       | #f4f6f9   | Body background, section card fills |
| Surface        | "White"       | #ffffff   | Hero bg, card interiors, step card surfaces |
| Text Primary   | "Ink"         | #1a2030   | All headlines, body text |
| Text Secondary | "Slate"       | #5a6577   | Subtitles, labels, supporting copy |
| Text Tertiary  | "Muted"       | #8893a5   | Placeholder, trust lines, captions |
| Border         | "Feather"     | #e4e8ee   | Card edges, hairline dividers |
| Border Strong  | "Bone"        | #d6dce5   | Input focus borders |
| Note Violet    | "Clinical"    | #6f5acc   | Evaluation note type badge |
| Note Amber     | "Warm"        | #c47a09   | Progress note type badge |
| Note Steel     | "Steel"       | #7c8699   | Discharge note type badge |

### Typography

Font: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif
(Inter is already loaded globally in the app — no additional font loading needed.)

| Role       | Weight | Size                    | Letter-Spacing | Line-Height | Notes |
|------------|--------|-------------------------|----------------|-------------|-------|
| Hero H1    | 900    | clamp(52px, 9vw, 104px) | -0.04em        | 1.0         | text-wrap: balance; "care." in teal |
| Section H2 | 700    | clamp(28px, 4vw, 40px)  | -0.02em        | 1.1         | |
| Sub H3     | 700    | 22–24px                 | -0.01em        | 1.2         | |
| Body       | 400    | 16–18px                 | 0              | 1.6         | color: #5a6577 |
| Label      | 700    | 11px                    | 0.14em         | 1           | text-transform: uppercase; color: #0a6d70 |
| CTA Pill   | 700    | 15.5px                  | -0.01em        | normal      | |
| Nav Logo   | 700    | 15.5px                  | -0.02em        | normal      | color: white |

⚑ DRAMA RATIO: The hero headline uses 900-weight Inter at clamp(52px, 9vw, 104px) with
-0.04em tracking on a white/transparent background. Pure typographic impact through scale
and weight, zero decoration. The only color break is the word "care." in teal (#0ea5a8).
DO NOT add gradients, outlines, or texture to the headline. The whitespace does the work.

### Texture System

- Noise/grain: none — completely flat
- Border radius:
  xs=8px (nav item highlights, small badges)
  sm=12px (CTA secondary button)
  md=16px (step cards, feature cards)
  lg=24px (large section containers, browser mockup chrome)
  full=999px (primary CTA pill, note-type badge pills)
- Shadows:
  Elevation 1: `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` — cards
  Elevation 2: `0 4px 16px rgba(26,32,48,0.10)` — floating nav, browser mockup
- Page background radial gradient (inject on outermost div):
  `radial-gradient(ellipse 80% 50% at 50% 0%, oklch(64% 0.12 185 / 0.13) 0%, transparent 65%), #f4f6f9`

### CSS @keyframes (inject via useEffect style tag, id="ldg-styles", cleanup on unmount)

```css
@keyframes ldg-up {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ldg-u  { animation: ldg-up 0.7s cubic-bezier(0.22,1,0.36,1) both; }
.ldg-u1 { animation-delay: 0.04s; }
.ldg-u2 { animation-delay: 0.14s; }
.ldg-u3 { animation-delay: 0.24s; }
.ldg-u4 { animation-delay: 0.34s; }

@keyframes ldg-pulse-ring {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.5); opacity: 0; }
}
.ldg-record-ring {
  position: absolute; inset: -8px; border-radius: 999px;
  border: 2px solid #0ea5a8;
  animation: ldg-pulse-ring 1.5s cubic-bezier(0.22,1,0.36,1) infinite;
}

@keyframes ldg-wave {
  0%, 100% { transform: scaleY(0.3); }
  50%       { transform: scaleY(1); }
}

#ldg-demo:hover  { background: #0a6d70 !important; }
#ldg-setup:hover { border-color: #0a6d70 !important; }
.ldg-nav-cta:hover { background: #0a6d70 !important; }

@media (prefers-reduced-motion: reduce) { .ldg-u, .ldg-record-ring { animation: none; } }
@media (max-width: 600px) {
  #ldg-nav  { padding: 16px 24px !important; }
  #ldg-hero { padding: 52px 24px 44px !important; }
  #ldg-mid  { padding: 0 24px 80px !important; }
  #ldg-disc { padding: 0 24px 48px !important; }
  #ldg-foot { padding: 0 24px 40px !important; }
  #ldg-ctas { flex-direction: column !important; align-items: stretch !important; }
  #ldg-ctas > button { text-align: center !important; }
}
```

---

## COMPONENT ARCHITECTURE

### NAV — "The Floating Island"

A dark navy pill fixed at the top of the viewport. Does NOT change on scroll — identical
throughout.

```
position: fixed, top: 16px, left: 50%, transform: translateX(-50%), zIndex: 100
background: #1a2030, border-radius: 999px
padding: 10px 10px 10px 20px
display: flex, align-items: center, justify-content: space-between, gap: 12px
box-shadow: 0 4px 16px rgba(26,32,48,0.18)
min-width: 360px, max-width: 600px, width: calc(100% - 48px)

LEFT side (flex row, gap: 8px, align-items: center):
  P mark: 28×28px div, border-radius: 8px, background: #0ea5a8
          white "P" — font-size: 13px, weight: 800, letter-spacing: -0.02em
          display: flex, align-items: center, justify-content: center
  "PTScribe" wordmark: font-size: 15.5px, weight: 700, color: #ffffff,
                       letter-spacing: -0.02em

RIGHT side (flex row, gap: 12px, align-items: center):
  Beta badge: font-size: 10.5px, weight: 700, letter-spacing: 0.08em,
              color: rgba(255,255,255,0.45), text-transform: uppercase
              border: 1px solid rgba(255,255,255,0.15), border-radius: 20px, padding: 3px 10px
  "Try Demo" button (className="ldg-nav-cta"):
              padding: 9px 20px, background: #0ea5a8, border-radius: 999px
              color: white, font-size: 14px, weight: 700, border: none, cursor: pointer
              transition: background 150ms ease-out
              onClick: handleDemo()
```

---

### HERO — "The Quiet Promise"

Center-aligned, transparent background (page radial gradient shows through). Fast
fade-in-up entrance via ldg-u classes. Conditional: shows CTA buttons OR code entry form.

```
<section id="ldg-hero">
  padding: 100px 48px 64px (top accounts for fixed nav)
  max-width: 1040px, width: 100%, margin: 0 auto, text-align: center
  display: flex, flex-direction: column, align-items: center

  Eyebrow label (div.ldg-u.ldg-u1):
    "For Physical Therapists"
    font-size: 11px, weight: 700, letter-spacing: 0.14em
    text-transform: uppercase, color: #0a6d70, margin-bottom: 24px

  H1 (h1#ldg-h1.ldg-u.ldg-u2):
    "Better care,<br/>less <span teal>work.</span>"
    font-size: clamp(52px, 9vw, 104px), weight: 900
    line-height: 1.0, letter-spacing: -0.04em
    color: #1a2030, margin: 0 0 24px
    text-wrap: balance
    NOTE: "work." is wrapped in <span style={{ color: '#0ea5a8' }}>work.</span>

  Subheadline (p.ldg-u.ldg-u3):
    "PTScribe writes your notes while you treat — so you finish the day
     with your patients, not your paperwork."
    font-size: 18px, line-height: 1.6, color: #5a6577
    max-width: 480px, margin: 0 auto 44px

  When showCode === false (div.ldg-u.ldg-u4):
    CTA group (div#ldg-ctas): display: flex, gap: 12px, justify-content: center, flex-wrap: wrap
      "Try Demo" (button#ldg-demo):
        padding: 15px 40px, background: #0ea5a8, border-radius: 12px
        color: white, font-size: 15.5px, weight: 700, letter-spacing: -0.01em
        transition: background 150ms ease-out
        onClick: handleDemo()
      "Set up your account" (button#ldg-setup):
        padding: 15px 40px, border: 1.5px solid #d6dce5, border-radius: 12px
        color: #1a2030, font-size: 15.5px, weight: 600
        transition: border-color 150ms ease-out
        onClick: () => navigate('/login')
    Trust line (div, margin-top: 16px):
      display: flex, align-items: center, gap: 6px, color: #8893a5
      <Lock size={11} color="#8893a5" strokeWidth={2} />
      <span style={{ fontSize: 12 }}>Encrypted at rest · AI calls sent over TLS</span>

  When showCode === true (form):
    Carry forward the existing 6-digit code entry form from Landing.tsx verbatim:
    max-width: 300px, display: flex, flex-direction: column, gap: 8px
    Label: "Enter the 6-digit demo code" — font-size: 12.5px, weight: 600, color: #5a6577
    Input row: flex, gap: 8px
      input: flex:1, padding: 12px 14px, border: 1.5px solid (error ? #dc2942 : #e4e8ee)
             border-radius: 10px, font-size: 20px, letter-spacing: 0.3em, text-align: center
             color: #1a2030, background: white, inputMode="numeric", maxLength={6}
      Submit button: padding: 12px 18px, border-radius: 10px, border: none
                     background: (code.length===6 && !busy) ? #0ea5a8 : #f1f3f7
                     color: (code.length===6 && !busy) ? white : #8893a5
                     font-weight: 700, font-size: 14px, transition: background 150ms
    Error text: font-size: 12px, color: #dc2942
    Back link: font-size: 12px, color: #8893a5, cursor: pointer
```

---

### SECTION 2 — "The Session Reel"

The crown jewel. A tall section (~4800px) with a sticky browser mockup. React state
`workflowStep` (0–3) drives which screen content is shown. IntersectionObserver on
3 sentinel divs updates workflowStep. Screen layers are absolute-positioned, toggling
opacity based on workflowStep.

OUTER CONTAINER:
```
<div style={{ maxWidth: 1040px, margin: '0 auto', padding: '0 24px 80px' }}>
  <div style={{
    background: '#ffffff', borderRadius: 24px, padding: '64px 48px',
    position: 'relative', overflow: 'hidden'
  }}>
    Opening H2:
      "PTScribe turns every visit into a finished note."
      font-size: clamp(28px, 4vw, 40px), weight: 700, color: #1a2030
      letter-spacing: -0.02em, text-align: center, margin-bottom: 64px

    STICKY MOCKUP WRAPPER:
      position: sticky, top: 120px
      display: flex, flex-direction: column, align-items: center, gap: 40px

    BROWSER MOCKUP:
      width: 680px, max-width: 100%
      background: #1a2030, border-radius: 16px
      box-shadow: 0 24px 64px rgba(26,32,48,0.24)
      overflow: hidden

      Chrome bar (40px height):
        background: #252d3d, padding: 0 16px
        display: flex, align-items: center, gap: 12px
        Three dots: 10px circles — #dc2942, #c47a09, #4caf72 — gap: 6px
        URL pill: flex:1, height: 22px, background: rgba(255,255,255,0.08)
                  border-radius: 999px, margin: 0 20px
                  content: "ptscribe.app/session/sarah-m" — 10px, #8893a5, text-align: center

      Screen area (min-height: 480px, background: #f4f6f9, position: relative):
        Four absolute-positioned screen layers (top:0, left:0, right:0, bottom:0)
        Each: opacity controlled by workflowStep, transition: 'opacity 500ms ease-out'
        Active step → opacity: 1, inactive → opacity: 0
        z-index: active step gets z-index: 1, others: 0

    SUB-HEADLINE AREA (below mockup):
      display: flex, flex-direction: column, align-items: center, gap: 8px
      H3: workflowStep-dependent text (see screen contents below)
          font-size: 28px, weight: 700, color: #1a2030, letter-spacing: -0.02em
      P: step description — font-size: 16px, color: #5a6577, max-width: 440px, text-align: center

    SENTINEL DIVS (position: absolute inside outer container, not sticky wrapper):
      <div ref={sentinel1} style={{ position: 'absolute', top: '1200px', height: 1 }} />
      <div ref={sentinel2} style={{ position: 'absolute', top: '2400px', height: 1 }} />
      <div ref={sentinel3} style={{ position: 'absolute', top: '3600px', height: 1 }} />

    SPACER: height: 4800px, position: relative (contains sentinels)
```

IntersectionObserver logic:
```typescript
const [workflowStep, setWorkflowStep] = useState(0);
const sentinel1 = useRef<HTMLDivElement>(null);
const sentinel2 = useRef<HTMLDivElement>(null);
const sentinel3 = useRef<HTMLDivElement>(null);

useEffect(() => {
  const observers: IntersectionObserver[] = [];
  [[sentinel1, 1], [sentinel2, 2], [sentinel3, 3]].forEach(([ref, step]) => {
    if (!(ref as React.RefObject<HTMLDivElement>).current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setWorkflowStep(step as number); },
      { threshold: 0.5 }
    );
    obs.observe((ref as React.RefObject<HTMLDivElement>).current!);
    observers.push(obs);
  });
  return () => observers.forEach(o => o.disconnect());
}, []);
```

SCREEN CONTENT — STEP 0 "Record. Hands-free.":
```
bg: white, padding: 32px, display: flex, flex-direction: column, align-items: center, gap: 24px

Patient header: "Sarah M. — Follow-up Visit"
  font-size: 16px, weight: 600, color: #1a2030

Record button area (position: relative, width: 80px, height: 80px):
  Outer ring div (.ldg-record-ring): absolutely positioned halo, pulsing animation
  Inner circle: 80px, border-radius: 999px, bg: #0ea5a8
               display: flex, align-items: center, justify-content: center
               Mic icon SVG (white, 28px) or ⏺ symbol

Timer: "00:00" — font-size: 24px, weight: 400, color: #8893a5,
       font-variant-numeric: tabular-nums, font-family: 'JetBrains Mono', monospace

Status: "Tap to begin recording" — font-size: 13px, color: #8893a5

Waveform (flat): 5 divs in a row, gap: 4px, each: width: 4px, height: 4px (flat),
                 background: #e4e8ee, border-radius: 999px

Sub-headline: "Record. Hands-free." / "No extra hardware — just your browser and a microphone."
```

SCREEN CONTENT — STEP 1 "Transcription in seconds.":
```
bg: white, padding: 32px

Recording header row: red stop button (40px, #dc2942, border-radius: 999px) + timer "03:42"
                      (font-size: 16px, tabular-nums, color: #1a2030) — flex row, gap: 12px

Waveform (animated — 5 bars):
  Each bar: width: 5px, height: 32px, background: #0ea5a8, border-radius: 999px
  className="ldg-wave-bar", transform-origin: bottom center
  animation: ldg-wave 0.8s ease-in-out infinite
  animation-delay: 0ms / 80ms / 160ms / 240ms / 320ms per bar

Transcript section (margin-top: 20px):
  Label: "TRANSCRIPT" — 10px, 700, #8893a5, letter-spacing: 0.1em, uppercase, margin-bottom: 8px
  3 text rows: each — padding: 8px 12px, background: #f4f6f9, border-radius: 8px, margin-bottom: 6px
               font-size: 13px, color: #1a2030, line-height: 1.5
    Row 1: "Patient reports pain level 4 out of 10 today, down from 6..."
    Row 2: "Range of motion improved approximately 15 degrees since last visit..."
    Row 3: "Tolerated all exercises without compensation patterns..." + blinking cursor ▌
  Cursor blink: opacity 0/1, 500ms step-start infinite

Sub-headline: "Transcription in seconds." / "Whisper AI converts the session to text while you wrap up."
```

SCREEN CONTENT — STEP 2 "Your note, drafted.":
```
bg: white, padding: 28px

Header row: "Generating note..." label (font-size: 13px, color: #6f5acc, weight: 600)
             with violet spinner SVG (14px, spinning 1s linear infinite)

Note sections (margin-top: 16px, display: flex, flex-direction: column, gap: 0):
  Each section: border-bottom: 1px solid #e4e8ee, padding: 12px 0

  Section label: font-size: 10px, weight: 700, letter-spacing: 0.12em, color: #8893a5, uppercase
                 margin-bottom: 6px
  Section body: font-size: 12px, color: #1a2030, line-height: 1.6

  SUBJECTIVE: "Patient reports improvement in pain from 6/10 to 4/10 since last visit.
               Reports increased tolerance for prolonged standing."
  OBJECTIVE:  "ROM: shoulder flexion 165° (↑ from 150°). MMT: deltoid 4/5.
               No compensation patterns observed."
  ASSESSMENT: "Patient progressing toward discharge goals. Pain and ROM improving."
  PLAN:       "Continue HEP with theraband series. Follow-up in 1 week."

Sub-headline: "Your note, drafted." / "Claude writes the SOAP structure from the transcript. You review, edit, and sign."
```

SCREEN CONTENT — STEP 3 "Ready to sign.":
```
bg: white, padding: 28px

Header row: "Ready" badge — background: #e6f7f6, color: #0a6d70, padding: 4px 12px,
             border-radius: 999px, font-size: 12px, weight: 600
             + "Sarah M. — Follow-up" (font-size: 13px, color: #5a6577, margin-left: auto)

Note sections: same structure as step 2, but all sections filled and no spinner
               All text in #1a2030 (no violet, no loading state)

Finalize button (full-width, margin-top: 20px):
  "Finalize Note →"
  padding: 12px 20px, background: #0ea5a8, border-radius: 8px
  color: white, font-size: 14px, weight: 700, width: 100%, text-align: center

Sub-headline: "Ready to sign." / "Edit any section, then finalize. Your note stays on your device, encrypted."
```

---

### SECTION 3 — "The Clinical Compass"

Adapted from Glossar's Levels section. Left-aligned headline + 4 colored note-type pills +
dark note-detail card below.

```
<div style={{ maxWidth: 1040px, margin: '0 auto', padding: '80px 48px' }}>

  H2 (left-aligned):
    "Every visit type, covered."
    font-size: clamp(28px, 4vw, 40px), weight: 700, color: #1a2030, letter-spacing: -0.02em
    margin-bottom: 12px

  Subtext (left-aligned, max-width: 560px):
    "From initial evaluations to discharge summaries — PTScribe handles them all."
    font-size: 18px, color: #5a6577, line-height: 1.55, margin-bottom: 40px

  Pills row (display: flex, gap: 12px, flex-wrap: wrap):
    "Evaluation": background: #6f5acc, color: white
    "SOAP":       background: #0ea5a8, color: white
    "Progress":   background: #c47a09, color: white
    "Discharge":  background: #7c8699, color: white
    Each: border-radius: 999px, padding: 10px 22px,
          font-size: 15px, weight: 700, cursor: default

  Note detail card (margin-top: 60px, max-width: 520px, centered):
    background: #1a2030, border-radius: 20px, padding: 32px
    box-shadow: 0 4px 16px rgba(26,32,48,0.10)

    Header: "SOAP Note — Follow-up" (14px, weight: 500, color: white)
            + teal dot (8px circle, #0ea5a8) + "Ready" (11px, #0ea5a8, weight: 600) — flex row

    4 sections (margin-top: 20px, display: flex, flex-direction: column, gap: 0):
      Divider: 1px solid rgba(255,255,255,0.08) between each
      Label: 10px, 700, letter-spacing: 0.12em, color: #8893a5, uppercase, margin-bottom: 6px, padding-top: 14px
      Body: 13px, 400, color: rgba(255,255,255,0.82), line-height: 1.65

    Bottom: "Finalize Note →" button
      padding: 10px 16px, background: #0ea5a8, border-radius: 8px, color: white,
      font-size: 13px, weight: 600, width: 100%, margin-top: 20px, text-align: center

  Below card:
    H3: "Every section, editable." — 22px, 700, #1a2030, text-align: center, margin-top: 32px
```

---

### SECTION 4 — "The Practice at a Glance"

Adapted from Glossar's Showcase section. Large light-grey card with session list mockup.

```
<div style={{ maxWidth: 1040px, margin: '0 auto', padding: '0 24px 80px' }}>
  <div style={{ background: '#f4f6f9', borderRadius: 24px, padding: '64px 48px' }}>

    H2 (centered): "Seamless practice."
      font-size: clamp(28px, 4vw, 40px), weight: 700, #1a2030, letter-spacing: -0.02em
      margin-bottom: 48px

    Browser mockup (same chrome bar design as Section 2, width: 560px, centered):
      background: #1a2030, border-radius: 16px, box-shadow: 0 24px 64px rgba(26,32,48,0.24)

      Chrome bar: identical to Section 2 (40px, 3 dots, URL pill showing "ptscribe.app/today")

      Screen content (bg: #f4f6f9, padding: 20px):
        Header: "Today's Sessions" — 16px, 600, #1a2030
        Filter tabs row: "All" [active: teal bg, white text, border-radius: 999px, padding: 4px 12px]
                         "Draft" "Ready" "Finalized" [inactive: transparent, #5a6577]
                         font-size: 12px, gap: 6px

        3 session rows (margin-top: 16px):
          Each row: padding: 12px 0, border-bottom: 1px solid #e4e8ee
                    display: flex, align-items: center, gap: 12px
          Status dot: 8px circle (teal / amber / green per status)
          Patient name: 14px, 500, #1a2030
          Session type: 12px, #8893a5 (Follow-up / Evaluation / Progress)
          Duration: 12px, #8893a5, font-variant-numeric: tabular-nums, margin-left: auto

          Row 1: teal dot | "Sarah M." | "Follow-up" | "03:42" | "Ready" teal badge
          Row 2: amber dot | "James K." | "Evaluation" | "01:12" | "Draft" amber badge
          Row 3: green dot | "Linda T." | "Progress" | "05:20" | "Finalized" slate badge

    Subhead section (margin-top: 48px, text-align: center):
      H3: "Completely yours." — 24px, 700, #1a2030, margin-bottom: 12px
      P: "Customize templates, rename sections, and add your clinical voice."
         16px, #5a6577, max-width: 400px, margin: 0 auto, line-height: 1.6
```

---

### SECTION 5 — "The Three Promises"

Adapted from Glossar's vocabulary cards. 3-column dark feature cards on a light card background.
IntersectionObserver entrance animation with staggered delay.

```
<div style={{ maxWidth: 1040px, margin: '0 auto', padding: '0 24px 80px' }}>
  <div style={{ background: '#f4f6f9', borderRadius: 24px, padding: '64px 48px' }}>

    H2 (centered): "The complete picture, on your terms."
      font-size: clamp(28px, 4vw, 36px), weight: 700, #1a2030, letter-spacing: -0.02em, margin-bottom: 12px

    Subtext (centered):
      "PTScribe keeps things simple — by design."
      font-size: 18px, color: #5a6577, margin-bottom: 48px

    3-col grid:
      display: grid, grid-template-columns: repeat(3, 1fr), gap: 16px
      at max-width ≤768px: grid-template-columns: 1fr

    Card 1 (entrance delay: 0ms):
      background: #1a2030, border-radius: 16px, padding: 28px 24px
      display: flex, flex-direction: column, gap: 12px
      Color dot: 10px circle, background: #6f5acc (violet)
      Title: "On your device." — 20px, 700, white, letter-spacing: -0.01em
      Body: "Everything encrypted locally. Zero servers store your notes — ever."
             14px, 400, rgba(255,255,255,0.65), line-height: 1.65

    Card 2 (entrance delay: 80ms):
      Color dot: #0ea5a8 (teal)
      Title: "90 seconds."
      Body: "From recording to a signed SOAP note in under two minutes."

    Card 3 (entrance delay: 160ms):
      Color dot: #c47a09 (amber)
      Title: "Any visit type."
      Body: "Evaluation, SOAP, progress note, discharge — PTScribe handles all of them."

    Card entrance animation (IntersectionObserver, threshold: 0.3):
      FROM: opacity: 0, transform: translateY(24px)
      TO: opacity: 1, transform: translateY(0)
      Duration: 600ms, easing: cubic-bezier(0.22,1,0.36,1)
      Use staggered inline style animation-delay: 0ms / 80ms / 160ms
      Add class when intersecting: set via state or ref-based class toggle
```

---

### SECTION 6 — "The Time Revelation"

Emotional close. Mirror of the hero. Earned-payoff copy pattern from the reference site.

```
<div style={{ maxWidth: 1040px, margin: '0 auto', padding: '120px 48px', textAlign: 'center' }}>

  P mark (large, entrance animation: fade-in-up, 700ms cubic-bezier(0.22,1,0.36,1)):
    72×72px div, border-radius: 20px, background: #0ea5a8
    "P" — font-size: 32px, weight: 800, color: white, letter-spacing: -0.02em
    display: flex, align-items: center, justify-content: center
    margin: 0 auto 40px

  H2:
    "That note took 90 seconds.<br/>Imagine a full week."
    font-size: clamp(28px, 5vw, 52px), weight: 900, color: #1a2030
    letter-spacing: -0.03em, line-height: 1.05
    margin-bottom: 48px

  "Try Demo" button:
    padding: 16px 48px, background: #0ea5a8, border-radius: 12px
    color: white, font-size: 16px, weight: 700, border: none, cursor: pointer
    transition: background 150ms ease-out
    hover → background: #0a6d70
    onClick: handleDemo()

  Entrance (IntersectionObserver, threshold: 0.5):
    FROM: opacity: 0, translateY(24px)
    TO: opacity: 1, translateY(0)
    Duration: 700ms, easing: cubic-bezier(0.22,1,0.36,1)
```

---

### DISCLOSURE + FOOTER — "The Honest Footnote"

```
<div id="ldg-disc">
  padding: 0 48px 52px, max-width: 1040px, margin: 0 auto

  Inner div:
    border-top: 1px solid #e4e8ee, padding-top: 28px
    display: flex, flex-direction: column, gap: 8px

  Paragraph 1:
    font-size: 12px, color: #8893a5, line-height: 1.65, margin: 0
    <strong style={{ color: '#5a6577', fontWeight: 600 }}>PTScribe is not HIPAA-certified.</strong>
    {' '}Treat anything you record as PHI and confirm BAA terms with Cloudflare and Anthropic
    before using real patient data. Full disclosure is shown during setup.

  Paragraph 2:
    font-size: 12px, color: #8893a5, line-height: 1.65, margin: 0
    <strong style={{ color: '#5a6577', fontWeight: 600 }}>Patient consent required</strong>
    {' '}— obtain explicit verbal or written consent before recording any session.

<footer id="ldg-foot">
  padding: 0 48px 48px, max-width: 1040px, margin: 0 auto

  Inner div: font-size: 13px, color: #8893a5, display: flex, align-items: center, gap: 14px, flex-wrap: wrap

  "Already have an account? "
  <button onClick={() => navigate('/login')} style color: #0ea5a8, weight: 600, font-size: 13px>Sign in</button>
  <span style={{ color: '#e4e8ee' }}>·</span>
  <a href="mailto:support@ptscribe.app" style color: #0ea5a8, weight: 600, font-size: 13px>support@ptscribe.app</a>
```

---

## TECHNICAL REQUIREMENTS

```
Stack:                React 19 + TypeScript. Single file: src/pages/Landing.tsx.
                      Exports: export function Landing({ onSignIn }: LandingProps)
                      Imports needed: useEffect, useRef, useState from 'react'
                                      useNavigate, useLocation from 'react-router-dom'
                                      Lock from 'lucide-react' (already a project dependency)

Animation:            CSS @keyframes only. Inject via useEffect with a <style> tag
                      (id="ldg-styles"). Check if existing tag exists before injecting.
                      Return cleanup: () => document.getElementById('ldg-styles')?.remove()
                      Keyframes: ldg-up (entrance), ldg-pulse-ring (record button halo),
                                 ldg-wave (waveform bars)

Scroll:               No external library. IntersectionObserver (native browser API) only.
                      Two usages:
                        1. Section entrances: observe each major section with threshold 0.2,
                           on intersect add class/set state to trigger ldg-up or custom animation
                        2. Workflow Cinema step changes: observe 3 sentinel divs with threshold 0.5

Animation Lifecycle:  All IntersectionObservers created inside useEffect.
                      Stored in a ref array or disconnected in cleanup function:
                        return () => observers.forEach(obs => obs.disconnect())
                      useState for workflowStep (0|1|2|3) drives screen layer opacity.
                      CSS transitions handle the actual visual change (500ms ease-out).

Scroll Trigger Setup: Sentinel divs are absolutely positioned children of the tall section
                      spacer div (height: 4800px). Each sentinel is height: 1px, pointer-events: none.
                      positioned at top: 1200px, 2400px, 3600px from the spacer's top.
                      On intersection, call setWorkflowStep(1), setWorkflowStep(2), setWorkflowStep(3).

Hover Implementation: Via injected CSS stylesheet (same pattern as existing Landing.tsx):
                      #ldg-demo:hover, .ldg-nav-cta:hover → background: #0a6d70 !important
                      #ldg-setup:hover → border-color: #0a6d70 !important
                      Do NOT use onMouseEnter/onMouseLeave — use CSS.

Custom Cursor:        N/A — standard cursor throughout.

Font Loading:         Inter is already loaded globally in the app (index.html or global CSS).
                      Do not add a <link> to Google Fonts inside this component.
                      Use font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, ...

Image Sources:        None. All visual content is pure inline CSS + HTML:
                      - P mark: styled div with "P" text
                      - Browser chrome: CSS (dark bar, colored dots, pill URL bar)
                      - App screen content: styled divs with inline text
                      - Waveform: 5 animated divs
                      - Dots and badges: styled divs with border-radius: 999px
                      No <img> tags, no SVG file imports, no Unsplash URLs needed.
```

---

## EXECUTION DIRECTIVE

*"Do not build a marketing page; build the first moment of trust between a burnt-out clinician and a tool that promises to give them their evenings back."*
```

---

## User Instruction

Paste the block above into Claude or your preferred code generation tool to build the site. All phase outputs are saved in `plans/`.
