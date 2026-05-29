# Product

## Register

product

## Users

Physical therapists in outpatient and clinic settings — seeing 8–12 patients per day, often running behind, charting between appointments or after hours. They're clinically expert but not necessarily tech-savvy. Many use legacy EHR systems (Epic, WebPT) and feel frustrated by how much time paperwork steals from patient care. PTScribe's users care about speed, accuracy, and getting home on time — not the software itself. Two anchor personas — the busy clinician and the practice owner — are detailed under [Personas](#personas) below.

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

## Personas

Two personas anchor PTScribe product decisions. When a feature, copy choice, or default is ambiguous, ask: _which persona does this serve, and does it serve the other one too — or at least not get in their way?_

Both personas share a hard constraint: **PHI sensitivity, time scarcity, and a low tolerance for clinical software jank.** Neither will sit through a tutorial. Neither will read a settings page. If the first session doesn't produce a usable note, they don't come back.

### 1. "Just give me the note" — the busy clinician

**Name (working):** Dana, DPT
**Setting:** Outpatient ortho clinic. 10–14 patients/day, 30–45 min visits, documentation crammed between visits or after 6pm.
**Tech comfort:** Average. Uses an EMR daily, hates it. Has tried Heidi/Abridge/Freed; bounced off one for being too clicky and another for hallucinating goals.

**What she's trying to do:** Open the app, hit record, treat the patient. Stop, glance at a draft note, fix two things, copy/paste into the EMR. Total app-time per visit: **under 90 seconds of friction**, ideally under 45.

**What she's _not_ trying to do:** Configure templates. Manage a patient list (she'll create patients on the fly, or skip them for quick visits). Tune AI models, toggle silence detection, or understand what a "vault" is. Read disclaimers more than once.

**What kills her trust instantly:** A note that invents a goal, diagnosis, or measurement she didn't say out loud. Losing a recording — even once, even if it was "her browser's fault." A 30-second wait staring at a spinner with no progress signal. Any modal between "stop recording" and "see the draft." Having to re-enter her name, clinic, or settings after a browser update.

**What earns her loyalty:** Recording works the first time, every time — including when she switches tabs mid-visit or her laptop sleeps for 20 seconds. The default template produces a note her supervisor would accept with light edits. "Copy note" is one tap and lands in the EMR cleanly formatted. Costs feel invisible.

**Design implications:**

- **Record/Review is the home screen** for a returning user, not a dashboard.
- **One-tap record** from anywhere; no patient required to start.
- **Aggressive recording reliability**: wake lock, visibility resilience, autosave of partial audio, recovery on crash. A bug here is P0.
- **Silence removal + speedup are ON by default** if they don't hurt accuracy — Dana never has to know they exist. (Power-user toggles stay tucked away.)
- **Generated notes show provenance lightly** — mark inferred vs. transcribed subtly so she can scan-verify in seconds.
- **Errors are recoverable, not punitive.** Failed transcription? Keep the audio, offer retry, never lose state.
- **Defaults > settings.** Every settings screen is a small tax on Dana.

### 2. "I need my staff to do this the same way every time" — the PT business owner

**Name (working):** Marcus, PT, owner-operator
**Setting:** 2–3 location practice with 6–12 clinicians (mix of DPTs, PTAs, per-diem). Bills Medicare, commercial, and cash. Has been audited once and hated it.
**Tech comfort:** Above average. Runs the EMR contract, picks the scheduling tool, sets the documentation policy. Reads HIPAA updates.

**What he's trying to do:** Standardize how every clinician documents — same template structure, required sections, tone — so charts survive an audit and new hires ramp fast. Keep PHI handling defensible (a one-paragraph answer if a regulator asks where audio lives and who can decrypt it). Predict cost — no surprise $400 bill because someone left a recorder running over lunch. Onboard a new clinician in under 15 minutes.

**What he's _not_ trying to do:** Become an admin (set policy once, expect enforcement). Manage individual clinician accounts (he accepts single-user-per-browser as an MVP constraint, but it's a ceiling on adoption). Customize per-clinician templates — he wants _one_ SOAP, _one_ eval, _one_ progress note across the staff.

**What kills his trust instantly:** A clinician overrides the company template and ships an inconsistent note. PHI ends up somewhere he didn't sign off on. A junior staffer can't figure out how to start a session and falls back to handwritten notes. Cost grows faster than visit volume.

**What earns his loyalty:** Built-in templates that don't need editing to be audit-defensible. A clear, short HIPAA story surfaced once in Settings ("Audio and notes are encrypted at rest in the browser. AI calls go through our proxy with no provider credentials in the browser. We don't store PHI on our servers."). Operational guardrails — server-side abuse caps, recording length limits with a soft warning. Consistency by default. A trivial onboarding path.

**Design implications:**

- **Resist per-user customization.** Every "let users edit the template" feature points a knife at Marcus's consistency goal. When shipping customization, scope it tightly and make the _org default_ the strong path.
- **Built-in templates are a product, not a default to overwrite.** Keep them read-only, keep Clone visible.
- **Surface the security model in one place, in one paragraph.** Don't make Marcus piece it together from invariants.md.
- **Cost ceilings belong server-side** (per-key abuse caps, per-session length caps), surfaced as friendly UX, not silent failures.
- **Future multi-user thinking:** the unit of policy is the _organization_, not the clinician. Templates, exercises, retention defaults flow down; clinicians can clone but not override the org standard.
- **When the two personas align, the feature is right.** When they conflict, Dana wins on the recording-and-note-shipping path; Marcus wins on the template-and-policy path.

### How to use this doc

When proposing a change, write one line for each persona:

> **Dana:** Faster — one fewer tap before record.
> **Marcus:** Neutral — doesn't touch template or PHI handling.

If a change is "Dana: faster, Marcus: worse" (e.g., letting clinicians edit org templates inline), route the decision through the owner explicitly. If it's "Dana: neutral, Marcus: neutral," it probably isn't worth shipping.
