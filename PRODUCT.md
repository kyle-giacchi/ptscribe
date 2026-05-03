# Product

## Register

product

## Users

Physical therapists in outpatient and clinic settings — seeing 8–12 patients per day, often running behind, charting between appointments or after hours. They're clinically expert but not necessarily tech-savvy. Many use legacy EHR systems (Epic, WebPT) and feel frustrated by how much time paperwork steals from patient care. PTScribe's users care about speed, accuracy, and getting home on time — not the software itself.

## Product Purpose

PTScribe is a clinical scribe for physical therapists: record the session, get a structured note. The AI handles transcription and SOAP note generation; the PT reviews and signs off. Core workflow: open session → record audio → transcribe → generate note → finalize. Tracks patients, session history, customizable templates, an exercise library, and per-patient plans of care. Local-first (localStorage + IndexedDB), with AI calls proxied through Cloudflare Workers so credentials stay server-side. Success looks like: a PT finishes every note before leaving the clinic.

## Brand Personality

Warm competence. PTScribe should feel like a trusted colleague — present when you need it, out of the way when you don't. Not cold and clinical, not soft and bubbly. The emotional register is calm confidence: the feeling of a well-made tool that makes a hard job easier.

Three words: **focused, warm, precise**.

Reference: Superhuman — premium tool feel, tight typography, purposeful interactions, designed for power users who respect their own time.

## Anti-references

- **Generic SaaS dashboard** (Intercom, HubSpot, Zendesk): forgettable white-and-purple, interchangeable component grids, dashboard-for-the-sake-of-dashboard.
- **Consumer health / wellness apps** (Headspace, Calm, Hinge Health): pastel palettes, rounded bubbly type, soft illustrations — too soft and non-clinical for a professional charting context.
- **Legacy EHR** (Epic, Cerner, WebPT): dense blue-grey form grids, nav bars packed with tabs — soul-crushing even when accurate.
- **Dark hacker tool**: terminal aesthetic, neon-on-black, code-editor vibes — wrong register entirely for a clinical PT.

## Design Principles

1. **Warm competence, not cold precision.** The UI earns trust through warmth and care — not by mimicking sterile medical software. Color, spacing, and type should feel welcoming without sacrificing authority.
2. **Speed is the feature.** Superhuman's influence: every interaction should feel instant. No gratuitous chrome, no decorative animation that delays the user. Motion serves feedback, not aesthetics.
3. **Clinical clarity first.** SOAP notes, status badges, session timelines, and form fields carry real clinical meaning. Hierarchy must be unambiguous. Never sacrifice readability for visual flair.
4. **One tool, zero learning curve.** A PT who has never used software like this should feel comfortable within minutes. Language, layout, and flow should require no manual — just recognition.
5. **Accessible defaults, not afterthoughts.** WCAG AA throughout. PTs work in bright clinic rooms, on aging monitors, sometimes in a hurry. High contrast and keyboard navigation are table stakes, not stretch goals.

## Accessibility & Inclusion

WCAG AA compliance: 4.5:1 minimum contrast ratio on all text, focus-visible outlines on all interactive elements, keyboard-navigable throughout. Reduced motion: animations should respect `prefers-reduced-motion`. No color-only communication — semantic status should always pair color with label or icon.
