# Brand Interview — PTScribe

Reference site: https://glossar.app/
Date: 2026-05-10

---

## 1. PRODUCT IDENTITY
PTScribe is an AI-powered session note tool for physical therapists — it records the treatment visit, transcribes it via Whisper AI, and generates a structured SOAP/evaluation/progress/discharge note in seconds; all clinical data stays on the device. Category: Healthcare productivity / PT practice software.

Key facts from internal docs:
- Records audio in-browser (no extra hardware)
- Transcription: Cloudflare Workers AI (Deepgram Nova-3), with speaker diarization
- Note generation: Anthropic Claude via a Cloudflare Worker proxy (browser never sees API keys)
- Storage: all AppData in localStorage (encrypted), audio in IndexedDB (AES-GCM)
- Auth: BetterAuth — passkey + magic link, served from Cloudflare Worker at /api/auth
- Templates: SOAP, Evaluation, Progress Note, Discharge (built-in + customizable)
- PWA, works in browser, no native app install required

## 2. AUDIENCE PERSONA
Physical therapists and PT practice owners. Age range 28–55. Moderate technical sophistication — comfortable with tablets, EHRs, and web apps but not developers. Psychographic: "clinically conscientious but admin-burned" — they became PTs to treat patients, and they're losing 2–3 hours per day to documentation.

## 3. BRAND FEELING
Warm, premium, clinical-calm.
(User-specified: "playful and premium"; design system supports: "calm and professional, never alarming")

## 4. COLOR PALETTE
Existing PTScribe design system tokens (from style-guide + Landing.tsx):
  Primary accent (cyan-teal):   #0ea5a8  → CTAs, active states, icon fills
  Accent hover/fg:              #0a6d70  → hover state on primary buttons
  Accent soft (tint bg):        #e6f7f6  → chip backgrounds, soft highlights
  Dark nav frame:               #1a2030  → outer frame, nav bar (adapted: use as dark pill like Glossar)
  Page bg / body:               #f4f6f9  → light canvas (analogous to Glossar's #F5F5F7)
  Surface:                      #ffffff  → cards, hero bg
  Text primary:                 #1a2030  → headlines, body
  Text secondary:                #5a6577  → subtitles, labels
  Text tertiary:                 #8893a5  → placeholders, muted copy
  Border:                        #e4e8ee  → card edges
  Border strong:                 #d6dce5  → input focus borders

## 5. PAGE SECTIONS
In order:
1. Nav bar (sticky)
2. Hero
3. Problem Statement
4. Features / Benefits (scroll-driven workflow demo)
5. Note Types (adapted from Levels section)
6. App Showcase
7. Bottom CTA

## 6. PRIMARY HEADLINE
Headline: "Better care, less work."
Subheadline: "PTScribe writes your notes while you treat — so you finish the day with your patients, not your paperwork."

## 7. PRIMARY CTA
Action: Launch the demo experience
Button label: "Try Demo"

(Secondary CTA: "Set up your account" → /login)

## 8. KEY DIFFERENTIATOR
Simpler and cheaper than enterprise PT software (WebPT, Prompt, etc.) — no per-seat licensing, no locked-in billing integrations, no training required. Just open a session, record, and get a structured note. Everything runs in the browser. All data stays on your device — nothing stored on a server. Free to try.

## 9. ANIMATION INTENSITY
Level: 4 (Rich — GSAP scroll triggers, staggered reveals, interactive components)
Note: The existing app deliberately avoids JS animation libraries; but the *landing page* is the marketing surface and can use GSAP/Lenis. Use React + CSS animations + Lenis smooth scroll (no GSAP needed to hit level 4 if scroll-driven sections use IntersectionObserver + CSS). Match the Glossar approach: Lenis + CSS transitions + sticky phone-demo pattern.

## 10. TECH STACK
React (already in use — Vite + React 19 + TypeScript). Styling via inline styles + CSS custom properties (existing Landing.tsx pattern — avoids Tailwind on the landing page to keep it self-contained). Add Lenis for smooth scroll. CSS @keyframes + IntersectionObserver for entrance animations. No GSAP required — Glossar itself didn't use it.

## 11. CONTENT ASSETS
Logo: No file. Use inline SVG — "P" lettermark in a rounded square with cyan-teal (#0ea5a8) background, white text. Same shape as glossar's icon but PTScribe branded.
Photography: No. Use SVG illustrations or rendered app UI screenshots as mockup content.
Placeholder aesthetic: Clinical but warm — light backgrounds, subtle illustrations of PT scenarios (patient on treatment table, therapist writing notes, phone/tablet showing app). If using placeholders, describe them in the prompt as SVG mockups with the app's actual color palette.

## 12. SECTION MODIFICATIONS
Reference sections → PTScribe adaptation:

- Nav bar (sticky black pill): ADAPT — same pill shape, use #1a2030 (dark navy) instead of pure black. Logo: "P" mark + "PTScribe" wordmark. Replace "Buy now $2.99" teal bar with a single "Try Demo" pill CTA on right side of nav. No hamburger — just logo left, "Try Demo" right.

- Hero (icon + headline + CTA): ADAPT — same centered layout. Replace app icon with PTScribe "P" mark. Headline: "Better care, less work." Sub: "PTScribe writes your notes while you treat..." CTA pill: "Try Demo" (teal #0ea5a8) + secondary ghost button "Set up your account". Keep the lock/trust line below CTAs.

- Feature Story (5000px scroll-driven sticky phone demo): ADAPT — This is the crown jewel. Replace the German vocabulary widget with a scroll-driven walkthrough of the PTScribe workflow: (1) recording in progress — waveform visible in app, (2) transcription — text appearing in real-time, (3) note generation — structured SOAP note sections filling in. Opening headline: "PTScribe turns every session into a finished note." Use a laptop/browser mockup instead of a phone (the app is web-first). Sub-headlines at each scroll step: "Record hands-free." / "Transcription in seconds." / "SOAP note, ready to sign."

- Levels section (A1–C2 pills): ADAPT — Replace language level badges with PT note type badges: Evaluation / SOAP / Progress / Discharge. Keep the colored pill design. Copy: "Every visit, perfectly documented. From initial evaluations to discharge summaries." Each pill gets a distinct color (use violet, teal, amber, slate from the design system).

- Showcase section (app library screen): ADAPT — Show the PTScribe patient list / session view. Copy: "Your whole practice, at a glance." + "Everything in one place." Show patient list with session status indicators (draft / transcribing / ready / finalized).

- Vocabulary Cards (3-col dark word cards): ADAPT — Replace with 3-col feature cards. Each card: dark (#1a2030) background, feature name bold, description. Cards: (1) "On your device" — all data encrypted locally, (2) "Ready in seconds" — from record to note in under 2 minutes, (3) "Any visit type" — SOAP, eval, progress, discharge.

- Bottom CTA (emotional close): ADAPT — Replace "See? You just learned a word. Imagine a year." with "That note took 90 seconds. Imagine a full week." Keep PTScribe icon, keep pill CTA "Try Demo".

ADDED sections (not in reference):
- None for now (user said keep all, adapt/remove later).
