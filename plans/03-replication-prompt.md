# Replication Prompt — PTScribe Landing Page

Reference site cloned: https://glossar.app/
Audit mode: Standard

---

## 1. ROLE + AESTHETIC IDENTITY

**Role:** Act as a World-Class Senior Creative Technologist and Lead Frontend Engineer.

**Aesthetic Identity:** Clinical Warmth / The PT's Quiet, Confident Front Door

You are rebuilding `src/pages/Landing.tsx` in a React + TypeScript codebase (Vite, no Tailwind on this page — use inline styles + CSS custom properties throughout, matching the existing file's pattern). The result is a single exported function component `Landing({ onSignIn })` that visually adapts the scroll-driven storytelling architecture of glossar.app for PTScribe, a browser-based AI note tool for physical therapists.

The reference site's genius is restraint + scroll momentum: generous whitespace, Apple-calibrated type, one sticky phone mockup that evolves across 5000px, and a copy voice so specific it feels earned. Your job is to transplant that architecture into PTScribe's clinical-warm identity — teal instead of glossy black, "Better care, less work" instead of "Fluency at glances," a browser/laptop mockup instead of an iPhone.

---

## 2. CORE DESIGN SYSTEM

### Palette

| Semantic Name  | Descriptive Word | Hex     | Usage                                                     |
| -------------- | ---------------- | ------- | --------------------------------------------------------- |
| Primary Action | "Teal"           | #0ea5a8 | CTAs, active states, icon fills, badge pills, price badge |
| Primary Hover  | "Deep Teal"      | #0a6d70 | Hover state on primary buttons only                       |
| Accent Soft    | "Mist"           | #e6f7f6 | Chip backgrounds, soft highlight tints                    |
| Dark Frame     | "Midnight"       | #1a2030 | Nav pill background, dark cards, deep sections            |
| Page Canvas    | "Cloud"          | #f4f6f9 | Body background — analogous to Glossar's #F5F5F7          |
| Surface        | "White"          | #ffffff | Section cards, hero bg, card interiors                    |
| Text Primary   | "Ink"            | #1a2030 | All headlines, body text                                  |
| Text Secondary | "Slate"          | #5a6577 | Subtitles, labels, supporting copy                        |
| Text Tertiary  | "Muted"          | #8893a5 | Placeholder, trust lines, caption copy                    |
| Border         | "Feather"        | #e4e8ee | Card edges, hairline dividers                             |
| Border Strong  | "Bone"           | #d6dce5 | Input focus, strong separators                            |
| Note Violet    | "Clinical Blue"  | #6f5acc | Evaluation note type badge                                |
| Note Amber     | "Warm"           | #c47a09 | Progress note type badge                                  |
| Note Slate     | "Steel"          | #7c8699 | Discharge note type badge                                 |

### Typography

| Role        | Font Family                       | Weight | Size                    | Line-Height | Notes                                             |
| ----------- | --------------------------------- | ------ | ----------------------- | ----------- | ------------------------------------------------- |
| Hero H1     | 'Inter', ui-sans-serif, system-ui | 900    | clamp(52px, 9vw, 104px) | 1.0         | letter-spacing: -0.04em; text-wrap: balance       |
| Section H2  | 'Inter', ui-sans-serif, system-ui | 700    | clamp(28px, 4vw, 40px)  | 1.1         | letter-spacing: -0.02em                           |
| Sub H3      | 'Inter', ui-sans-serif, system-ui | 700    | 22–24px                 | 1.2         | letter-spacing: -0.01em                           |
| Body        | 'Inter', ui-sans-serif, system-ui | 400    | 16–18px                 | 1.6         | color: Text Secondary                             |
| Label/Badge | 'Inter', ui-sans-serif, system-ui | 700    | 11px                    | 1           | letter-spacing: 0.14em; text-transform: uppercase |
| CTA Pill    | 'Inter', ui-sans-serif, system-ui | 700    | 15.5px                  | normal      | letter-spacing: -0.01em                           |
| Nav Logo    | 'Inter', ui-sans-serif, system-ui | 700    | 15.5px                  | normal      | letter-spacing: -0.02em                           |

**⚑ Drama Ratio:** The hero headline uses 900-weight Inter at clamp(52px, 9vw, 104px) with -0.04em tracking on a white/transparent background — pure typographic impact through scale and weight, zero decoration. The accent word "care." in teal is the ONLY color break. Do not add gradients, outlines, or texture to the headline. The whitespace does the work.

**Color accent on headline:** Wrap the word "care." in `<span style={{ color: '#0ea5a8' }}>care.</span>` — matching the existing Landing.tsx pattern exactly.

### Texture System

- Noise/grain: none — completely flat, matching the reference site and PTScribe's design system
- Border radius scale:
  - xs: 8px — nav menu item highlights, small badges
  - sm: 12px — CTA secondary button
  - md: 16px — step cards, feature cards (rounded-xl)
  - lg: 20–24px — large section card containers, browser mockup chrome (rounded-2xl)
  - full: 999px — primary CTA pill, note-type badge pills
- Shadow system:
  - Elevation 1: `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` — cards
  - Elevation 2: `0 4px 16px rgba(26,32,48,0.10)` — floating nav, browser mockup
  - None: section containers (use border instead, 1px #e4e8ee)
- Radial gradient on body: `radial-gradient(ellipse 80% 50% at 50% 0%, oklch(64% 0.12 185 / 0.13) 0%, transparent 65%)` layered over `#f4f6f9` — carried forward from existing Landing.tsx

---

## 3. COMPONENT ARCHITECTURE

### SECTION 0: Sticky Nav — "The Floating Island"

The nav is a dark pill fixed at the top of the viewport, floating above all content. It does NOT change size or transparency on scroll — it stays fixed and identical throughout.

```
┌──────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────┐  │
│  │ [P mark]  PTScribe      [Beta pill]  Try Demo  │  │
│  └────────────────────────────────────────────────┘  │
│   ← dark navy pill (#1a2030), max-w ~600px centered   │
└──────────────────────────────────────────────────────┘
```

**Implementation spec:**

```
position: fixed, top: 16px, left: 50%, transform: translateX(-50%), zIndex: 100
background: #1a2030, border-radius: 999px
padding: 10px 10px 10px 20px
display: flex, align-items: center, gap: 12px
box-shadow: 0 4px 16px rgba(26,32,48,0.18)
min-width: 360px, max-width: 600px

LEFT:
  P mark square: 28x28px, border-radius: 8px, bg: #0ea5a8,
                 white "P" text, 13px, weight 800, letter-spacing: -0.02em
  "PTScribe" wordmark: 15.5px, weight 700, color: #ffffff, letter-spacing: -0.02em
  Gap between mark and wordmark: 8px

RIGHT:
  Beta pill: 10px/700/0.08em-tracking/#8893a5, border: 1px solid rgba(255,255,255,0.15),
             border-radius: 20px, padding: 3px 10px, text-transform: uppercase, color: rgba(255,255,255,0.5)
  "Try Demo" pill button: bg: #0ea5a8, color: white, border-radius: 999px,
                          padding: 9px 20px, font-size: 14px, weight: 700
                          hover → bg: #0a6d70, transition: 150ms ease-out
                          onClick: calls handleDemo() (same as existing)
```

---

### SECTION 1: Hero — "The Quiet Promise"

Center-aligned, white/transparent background, body bg gradient shows through. Fast fade-in-up entrance animation using existing `ldg-u` CSS keyframe pattern.

```
┌──────────────────────────────────────────────────────┐
│                   [100px top padding]                │
│                                                      │
│          "For Physical Therapists"  ← eyebrow label  │
│              (teal, uppercase, spaced)               │
│                                                      │
│         "Better care,                                │
│          less work."               ← H1, 900w        │
│          (ink, "care." in teal)                      │
│                                                      │
│   "PTScribe writes your notes while you treat —      │
│    so you finish the day with your patients,         │
│    not your paperwork."            ← body, 18px grey │
│                                                      │
│     ┌────────────────┐  ┌─────────────────────────┐ │
│     │   Try Demo     │  │  Set up your account    │ │
│     └────────────────┘  └─────────────────────────┘ │
│      teal filled pill     ghost border pill          │
│                                                      │
│        🔒  Encrypted at rest · AI calls over TLS     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Implementation spec:**

```
section: padding: 72px 48px 64px, max-width: 1040px, margin: 0 auto, text-align: center

Eyebrow label (ldg-u ldg-u1):
  font-size: 11px, font-weight: 700, letter-spacing: 0.14em
  text-transform: uppercase, color: #0a6d70, margin-bottom: 24px

H1 (ldg-u ldg-u2):
  font-size: clamp(52px, 9vw, 104px), font-weight: 900
  line-height: 1.0, letter-spacing: -0.04em
  color: #1a2030, margin: 0 0 24px
  text-wrap: balance
  "care." → <span style={{ color: '#0ea5a8' }}>care.</span>

Subheadline (ldg-u ldg-u3):
  font-size: 18px, line-height: 1.6, color: #5a6577
  max-width: 480px, margin: 0 auto 44px

CTA group (ldg-u ldg-u4):
  display: flex, gap: 12px, justify-content: center, flex-wrap: wrap

  "Try Demo" button:
    padding: 15px 40px, background: #0ea5a8, border-radius: 12px
    color: white, font-size: 15.5px, font-weight: 700
    hover → background: #0a6d70, transition: 150ms
    onClick: handleDemo()

  "Set up your account" button:
    padding: 15px 40px, border: 1.5px solid #d6dce5, border-radius: 12px
    color: #1a2030, font-size: 15.5px, font-weight: 600
    hover → border-color: #0a6d70, transition: 150ms
    onClick: navigate('/login')

Trust line:
  display: flex, align-items: center, gap: 6px, color: #8893a5
  Lock icon (11px, #8893a5) + "Encrypted at rest · AI calls sent over TLS"
  font-size: 12px, margin-top: 16px

Code entry form (shown when showCode === true):
  Carry forward the existing 6-digit code entry form from Landing.tsx exactly.
  max-width: 300px, centered. input: font-size 20px, letter-spacing 0.3em.
  Submit button: #0ea5a8 when code.length === 6, else slate-soft.
```

---

### SECTION 2: Workflow Cinema — "The Session Reel"

This is the crown jewel of the page. A tall scroll-driven section (~4800px) with a sticky browser/app mockup in the center. As the user scrolls, the mockup screen transitions through the 4 stages of the PTScribe workflow. The large rounded-corner card container holds everything.

```
┌──────────────────────────────────────────────────────────┐
│  (large rounded-corner card, bg: #ffffff, radius: 24px)  │
│                                                          │
│  "PTScribe turns every visit                             │
│   into a finished note."           ← opening H2         │
│                                                          │
│         ┌──────────────────────────┐                     │
│         │   [Browser chrome bar]   │  ← sticky mockup   │
│         │   ┌────────────────────┐ │                     │
│         │   │  App screen        │ │                     │
│         │   │  (changes on       │ │                     │
│         │   │   scroll)          │ │                     │
│         │   └────────────────────┘ │                     │
│         └──────────────────────────┘                     │
│                                                          │
│  [Scroll-triggered sub-headlines appear below mockup]    │
│  "Record. Hands-free."                                   │
│  "Transcription in seconds."                             │
│  "Your SOAP note, drafted."                              │
│  "Ready to sign."                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Browser Mockup Design:**

- Outer frame: #1a2030 (dark navy), border-radius: 16px, width: ~680px, centered
- Chrome bar at top: 40px height, three dots (red/amber/green circles, 10px each, gap 6px), URL bar in center (pill shape, bg: rgba(255,255,255,0.1), "ptscribe.app/session/...)
- Screen area below chrome: white background, shows app content
- Box shadow: `0 24px 64px rgba(26,32,48,0.24)` — deep shadow for floating effect

**Scroll-driven states (4 states across ~4800px):**

STATE 1 (scroll 0–1200px): "Record. Hands-free."

- App screen shows: PTScribe session view
- Patient name header: "Sarah M. — Follow-up"
- Large circular record button (teal #0ea5a8, 80px diameter, pulsing ring animation)
- Timer: "00:00" in tabular mono below button
- Status: "Tap to start recording"
- Waveform: flat horizontal line (pre-recording state)
- Sub-headline fades in: "Record. Hands-free." (28px, 700, #1a2030) + "No extra hardware — just your browser and a microphone." (16px, #5a6577)

STATE 2 (scroll 1200–2400px): "Transcription in seconds."

- Recording in progress: timer shows "03:42", waveform is animated (4–6 vertical bars of varying height, #0ea5a8, animating up-down)
- Red stop button replaces record button
- Below: transcript lines appearing — 3–4 lines of text streaming in with a blinking cursor at end:
  "Patient reports pain level 4/10 today, improvement..."
  "Range of motion improved 15 degrees since last visit..."
  "Patient tolerated all exercises without compensation..."
- Lines: 14px, #1a2030, bg: #f4f6f9 rows, 8px border-radius
- Sub-headline: "Transcription in seconds." + "Whisper AI converts the session to text while you wrap up."

STATE 3 (scroll 2400–3600px): "Your SOAP note, drafted."

- Screen shows structured note being generated
- Violet spinner in top-right: "Generating..." (#6f5acc)
- Note sections filling in with shimmer-then-text reveal:
  SUBJECTIVE: "Patient reports improvement in pain from 6/10 to 4/10..."
  OBJECTIVE: "ROM: shoulder flexion 165° (up from 150°). MMT: 4/5..."
  ASSESSMENT: "Patient progressing well toward discharge goals..."
  PLAN: "Continue HEP with theraband exercises. Follow up in 1 week."
- Each section header: 11px, 700, letter-spacing 0.1em, #8893a5, uppercase
- Section body: 13px, #1a2030, line-height 1.6
- Sub-headline: "Your note, drafted." + "Claude writes the SOAP structure from the transcript. You review, edit, and sign."

STATE 4 (scroll 3600–4800px): "Ready to sign."

- Note is complete, no spinner
- Green checkmark badge top-right: "Ready" in teal
- Finalize button visible: "Finalize Note →" (teal, full-width button)
- Note sections all filled, professional clinical language
- Sub-headline: "Ready to sign." + "Edit any section, then finalize. Your note stays on your device, encrypted."

**Sticky implementation:**

```javascript
// The mockup container is position: sticky, top: 120px
// The outer section is ~4800px tall
// Sub-headlines appear/disappear using IntersectionObserver on sentinel divs
// Each state transition: cross-fade between screen content (opacity 0→1, duration 500ms, ease-out)
// Use useRef on the section + IntersectionObserver with threshold 0.25 per sentinel

// Sentinel div structure:
// <div ref={sentinel1} style={{ position: 'absolute', top: '1200px' }} />
// <div ref={sentinel2} style={{ position: 'absolute', top: '2400px' }} />
// <div ref={sentinel3} style={{ position: 'absolute', top: '3600px' }} />

// State: const [workflowStep, setWorkflowStep] = useState(0) // 0–3
// IntersectionObserver on each sentinel sets workflowStep accordingly

// Screen content: absolute-positioned layers, z-index managed by workflowStep
// opacity transitions: 0→1 over 500ms ease-out (active step), 1→0 over 300ms (outgoing)
```

**Record button pulse animation:**

```css
@keyframes ldg-pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
.ldg-record-ring {
  position: absolute;
  inset: -8px;
  border-radius: 999px;
  border: 2px solid #0ea5a8;
  animation: ldg-pulse-ring 1.5s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
```

**Waveform animation (STATE 2 only):**

```css
@keyframes ldg-wave {
  0%,
  100% {
    transform: scaleY(0.3);
  }
  50% {
    transform: scaleY(1);
  }
}
/* 5 bars, each with different animation-delay: 0ms, 80ms, 160ms, 240ms, 320ms */
/* height: 32px, width: 4px, background: #0ea5a8, border-radius: 999px */
/* animation: ldg-wave 0.8s ease-in-out infinite */
```

---

### SECTION 3: Note Types — "The Clinical Compass"

Adapted from Glossar's Levels section (A1–C2 badges → PT note type badges). Left-aligned text + colored pill row + word-detail equivalent.

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│  "Every visit type, covered."         ← H2, left     │
│  "From initial evaluations to discharge              │
│   summaries — PTScribe handles them all."  ← grey    │
│                                                       │
│  [Evaluation] [SOAP] [Progress] [Discharge]           │
│   ← colored pills, 999px radius, full color bg       │
│                                                       │
│       ┌────────────────────────────────────┐          │
│       │  "Every section, editable."        │          │
│       │  [App note detail card, dark bg]   │          │
│       └────────────────────────────────────┘          │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Note type pill colors:**

```
Evaluation: #6f5acc (violet)
SOAP:        #0ea5a8 (teal)
Progress:    #c47a09 (amber)
Discharge:   #7c8699 (slate)

Each pill: border-radius: 999px, padding: 10px 22px
           color: white, font-size: 15px, font-weight: 700
           display: inline-block, cursor: default
```

**Note detail card (below pills):**

```
Dark card: background: #1a2030, border-radius: 20px, padding: 32px, max-width: 520px, centered
Shows example SOAP structure:
  Header: "SOAP Note — Follow-up" (14px, 500, white, with teal dot indicator "Ready")
  Section labels: "SUBJECTIVE" / "OBJECTIVE" / "ASSESSMENT" / "PLAN"
    → 10px, 700, letter-spacing 0.12em, color: #8893a5, uppercase
  Section content: 13px, 400, color: rgba(255,255,255,0.85), line-height 1.65
  Dividers: 1px solid rgba(255,255,255,0.08)
  Bottom action row: "Finalize Note →" button (teal, border-radius 8px, full-width)

Copy below card: "Every section, editable." (22px, 700, #1a2030)
```

---

### SECTION 4: Practice Showcase — "The Practice at a Glance"

Adapted from Glossar's Showcase section. Large light-grey card showing the PTScribe patient/session list.

```
┌──────────────────────────────────────────────────────┐
│  (card: bg #f4f6f9, border-radius: 24px)             │
│                                                      │
│  "Seamless practice."              ← H2              │
│                                                      │
│         ┌────────────────────────┐                   │
│         │  [App session list]    │  ← mockup         │
│         │  Patient list view     │                   │
│         └────────────────────────┘                   │
│                                                      │
│  "Completely yours."               ← H3              │
│  "Customize templates, rename sections,              │
│   and add your clinical voice."    ← body            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Session list mockup (browser frame, dark):**

```
Header bar: "Today's Sessions" (white, 16px, 600)
Status filter tabs: All / Draft / Ready / Finalized (small pill tabs, active=teal)
Session rows (3 visible):
  Row 1: "Sarah M. — Follow-up"   | "Ready"     | teal dot  | "03/42"
  Row 2: "James K. — Evaluation"  | "Draft"     | amber dot | "01:12"
  Row 3: "Linda T. — Progress"    | "Finalized" | green ✓   | "05:20"

Row styles: padding 12px 16px, border-bottom 1px rgba(255,255,255,0.07)
Patient name: 14px, 500, white
Session type: 12px, #8893a5
Status badge: 11px, 600, colored per status (teal/amber/slate)
```

---

### SECTION 5: Feature Cards — "The Three Promises"

Adapted from Glossar's vocabulary cards. 3-column grid of dark feature cards.

```
┌──────────────────────────────────────────────────────────┐
│  (card: bg #f4f6f9, border-radius: 24px)                 │
│                                                          │
│  "The complete picture,                                  │
│   on your terms."                  ← H2, centered       │
│  "PTScribe keeps things simple —                        │
│   by design."                      ← body               │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ [violet dot] │ │ [teal dot]   │ │ [amber dot]      │ │
│  │ On your      │ │ 90 seconds.  │ │ Any visit type.  │ │
│  │ device.      │ │ Start to     │ │ Eval, SOAP,      │ │
│  │ All data     │ │ signed note. │ │ progress, or     │ │
│  │ encrypted    │ │ No waiting.  │ │ discharge.       │ │
│  │ locally.     │ │              │ │                  │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Feature card design:**

```
Each card: background: #1a2030, border-radius: 16px, padding: 28px 24px
           display: flex, flex-direction: column, gap: 12px

Color dot: 10px circle at top (violet / teal / amber per card)

Card title: 20px, weight 700, color: white, letter-spacing: -0.01em
Card body: 14px, weight 400, color: rgba(255,255,255,0.65), line-height: 1.65

Card 1 content: "On your device." / "Everything encrypted locally. Zero servers store your notes — ever."
Card 2 content: "90 seconds." / "From recording to a signed SOAP note in under two minutes."
Card 3 content: "Any visit type." / "Evaluation, SOAP, progress note, discharge — PTScribe handles all of them."

Grid: display: grid, grid-template-columns: repeat(3, 1fr), gap: 16px
      At ≤768px: grid-template-columns: 1fr (stack vertically)

Entrance: IntersectionObserver, fade-in-up with stagger (0ms / 80ms / 160ms delay)
```

---

### SECTION 6: Bottom CTA — "The Time Revelation"

Emotional close. Mirror of the hero — same icon, same center alignment, different copy. The copy uses Glossar's earned-payoff pattern: specific time claim + scaled imagination.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│          ┌────────┐                                  │
│          │   P    │  ← PTScribe P mark, same as nav  │
│          └────────┘                                  │
│                                                      │
│  "That note took 90 seconds.                         │
│   Imagine a full week."            ← H2, centered    │
│                                                      │
│     ┌──────────────────────────────┐                 │
│     │          Try Demo            │                 │
│     └──────────────────────────────┘                 │
│      ← teal pill, same as hero CTA                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Implementation spec:**

```
Section: padding: 120px 48px, text-align: center, max-width: 1040px, margin: 0 auto

P mark (large): 72px × 72px, border-radius: 20px, bg: #0ea5a8, white "P"
                32px, 800 weight, letter-spacing: -0.02em
                margin-bottom: 40px
                entrance: fade-in-up, 700ms cubic-bezier(0.22,1,0.36,1), delay 0ms

H2: "That note took 90 seconds." (font-size: clamp(28px, 5vw, 48px), weight 900, #1a2030)
    "Imagine a full week." (same styles, separated by <br/>)
    letter-spacing: -0.03em, margin-bottom: 48px

CTA: identical to hero "Try Demo" button
     padding: 16px 48px, border-radius: 12px, font-size: 16px
     bg: #0ea5a8, color: white, weight: 700
     hover → #0a6d70, 150ms ease-out

Entrance: IntersectionObserver, threshold 0.5
          fade-in-up, 700ms cubic-bezier(0.22,1,0.36,1)
```

---

### DISCLOSURE + FOOTER — "The Honest Footnote"

Carry forward the existing Landing.tsx disclosure and footer exactly. The HIPAA and consent disclaimers stay verbatim. Adjust visual to use `#f4f6f9` background (already in existing styles).

```
Disclosure: border-top 1px #e4e8ee, padding-top: 28px
            Two <p> blocks: font-size 12px, color #8893a5, line-height 1.65
            HIPAA notice (strong #5a6577) + consent notice (strong #5a6577)

Footer: font-size 13px, color #8893a5
        "Already have an account? Sign in" + "support@ptscribe.app"
        Sign in and email in teal #0ea5a8, weight 600
```

---

## 4. TECHNICAL REQUIREMENTS

```
TECHNICAL REQUIREMENTS
  Stack:                React 19 + TypeScript. Single file: src/pages/Landing.tsx.
                        Export: `export function Landing({ onSignIn }: LandingProps)`
                        Interface: `interface LandingProps { onSignIn?: (code: string) => Promise<{ ok: boolean; error?: string }> }`
                        Preserve existing handleDemo(), handleSubmit(), and showCode state logic exactly.

  Animation:            CSS @keyframes only. Inject via a single <style> tag in useEffect
                        (same pattern as existing Landing.tsx — tag id="ldg-styles", cleanup on unmount).
                        Keyframes needed:
                          ldg-up (existing — carry forward)
                          ldg-pulse-ring (record button pulsing halo)
                          ldg-wave (waveform bar breathing)
                        Add hover styles via the injected stylesheet (e.g., #ldg-demo:hover).

  Scroll:               No external scroll library. Use IntersectionObserver (native) for:
                        1. Section entrance animations (trigger fade-in-up on each section)
                        2. Workflow Cinema state changes (observe 3 sentinel divs inside the tall section)
                        Create observers inside useEffect with cleanup.

  Animation Lifecycle:  All IntersectionObserver instances created in useEffect, stored in refs,
                        disconnected in cleanup function. No observers created during render.

  Scroll Trigger Setup: Workflow Cinema section:
                        const sectionRef = useRef<HTMLDivElement>(null)
                        const [step, setStep] = useState(0)
                        3 sentinel divs (absolute-positioned at 1200px, 2400px, 3600px inside section)
                        Observer threshold: 0.5
                        On intersect: setStep(sentinel index)
                        Screen layers: absolute positioned, opacity transition 500ms ease-out

  Hover Implementation: CSS via injected stylesheet for button hovers (same pattern as existing).
                        Rule: `#ldg-demo:hover { background: #0a6d70 !important; }`
                        Rule: `#ldg-setup:hover { border-color: #0a6d70 !important; }`
                        Rule: `.ldg-try-demo:hover { background: #0a6d70 !important; }`

  Custom Cursor:        N/A — standard cursor throughout.

  Font Loading:         Inter already loaded via the app's global CSS/index.html.
                        No additional font loading needed. Use:
                        font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif

  Image Sources:        No external images. All mockup content is inline HTML/CSS:
                        - Browser chrome: pure CSS (dark bar, three colored dots, URL pill)
                        - App screens: inline HTML with styled divs (no <img> tags)
                        - Waveform: 5 animated <div> bars
                        - P mark icon: inline div with CSS
                        - All colors from design system above

  CSS Custom Properties: Use `var(--color-pt-landing-bg)` for the page background
                        (matches existing Landing.tsx). All other colors are inline hex
                        values (hardcoded in the component, not via CSS vars) — matching
                        the existing pattern where the `C` constant holds the var() strings.
```

---

## 5. EXECUTION DIRECTIVE

_"Do not build a marketing page; build the first moment of trust between a burnt-out clinician and a tool that promises to give them their evenings back."_
