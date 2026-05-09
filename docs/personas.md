# Personas

Two personas anchor PTScribe product decisions. When a feature, copy choice, or default is ambiguous, ask: *which persona does this serve, and does it serve the other one too — or at least not get in their way?*

Both personas share a hard constraint: **PHI sensitivity, time scarcity, and a low tolerance for clinical software jank.** Neither will sit through a tutorial. Neither will read a settings page. If the first session doesn't produce a usable note, they don't come back.

---

## 1. "Just give me the note" — the busy clinician

**Name (working):** Dana, DPT
**Setting:** Outpatient ortho clinic. 10–14 patients/day, 30–45 min visits, documentation crammed between visits or after 6pm.
**Tech comfort:** Average. Uses an EMR daily, hates it. Has tried Heidi/Abridge/Freed; bounced off one for being too clicky and another for hallucinating goals.

### What she's trying to do

1. Open the app, hit record, treat the patient.
2. Stop recording, glance at a draft note, fix two things, copy/paste into the EMR.
3. Move on. Total app-time per visit: **under 90 seconds of friction**, ideally under 45.

### What she's *not* trying to do

- Configure templates.
- Manage a patient list (she'll create patients on the fly, or skip them entirely for quick visits).
- Tune AI models, toggle silence detection, or understand what a "vault" is.
- Read disclaimers more than once.

### What kills her trust instantly

- A note that invents a goal, diagnosis, or measurement she didn't say out loud.
- Losing a recording. Even once. Even if it was "her browser's fault."
- A 30-second wait staring at a spinner with no progress signal.
- Any modal between "stop recording" and "see the draft."
- Having to re-enter her name, clinic, or settings after a browser update.

### What earns her loyalty

- **Recording works the first time, every time** — including when she switches tabs to look up an exercise mid-visit, or her laptop sleeps for 20 seconds.
- The default template produces a note her supervisor would accept with light edits.
- "Copy note" is one tap and lands in the EMR cleanly formatted.
- Costs feel invisible — she shouldn't think about transcription minutes or token counts.

### Design implications

- **Record/Review is the home screen** for a returning user, not a dashboard. (We did this — keep it.)
- **One-tap record** from anywhere; no patient required to start.
- **Aggressive recording reliability**: wake lock, visibility resilience, autosave of partial audio, recovery on crash. If we ever ship a bug here, treat it as P0.
- **Silence removal + speedup are ON by default** if they don't hurt accuracy — Dana never has to know they exist. (Power-user toggles stay tucked away.)
- **Generated notes show provenance lightly** — if a section was inferred vs. transcribed, mark it subtly so she can scan-verify in seconds.
- **Errors are recoverable, not punitive.** Failed transcription? Keep the audio, offer retry, never lose state.
- **Defaults > settings.** Every settings screen we add is a small tax on Dana.

---

## 2. "I need my staff to do this the same way every time" — the PT business owner

**Name (working):** Marcus, PT, owner-operator
**Setting:** 2–3 location practice with 6–12 clinicians (mix of DPTs, PTAs, per-diem). Bills Medicare, commercial, and cash. Has been audited once and hated it.
**Tech comfort:** Above average. Runs the EMR contract, picks the scheduling tool, sets the documentation policy. Reads HIPAA updates.

### What he's trying to do

1. **Standardize how every clinician documents** — same template structure, same required sections, same tone — so charts survive an audit and new hires ramp fast.
2. **Keep PHI handling defensible.** If a regulator asks where audio lives and who can decrypt it, he wants a one-paragraph answer.
3. **Predict cost.** He doesn't want a surprise $400 transcription bill because someone left a recorder running over lunch.
4. **Onboard a new clinician in under 15 minutes** without a training session.

### What he's *not* trying to do

- Become an admin. He'll set policy once and expects the app to enforce it.
- Manage individual clinician accounts (today the app is single-user per browser — he knows this and accepts it as an MVP constraint, but it's a ceiling on how much he can adopt).
- Customize per-clinician templates. He wants *one* SOAP, *one* eval, *one* progress note across the whole staff.

### What kills his trust instantly

- A clinician overrides the company template and ships an inconsistent note.
- PHI ends up somewhere he didn't sign off on (a third-party transcription provider he didn't vet, a log file, an analytics pixel).
- A junior staffer can't figure out how to start a session and falls back to handwritten notes.
- Cost grows faster than visit volume.

### What earns his loyalty

- **Built-in templates that don't need editing** to be audit-defensible. (We have these — keep raising the quality bar.)
- **A clear, short HIPAA story.** "Audio and notes are encrypted at rest in the browser. AI calls go through our proxy with no provider credentials in the browser. We don't store PHI on our servers." Surfaced once, in plain English, in Settings.
- **Operational guardrails:** abuse caps server-side, recording length limits with a soft warning, a way to see his org's usage if he ever asks.
- **Consistency by default**: every clinician's SOAP note has the same sections in the same order with the same heading style, regardless of who recorded it.
- **A trivial onboarding path** — new hire opens the link, picks their name, records their first visit. No setup wizard longer than three screens.

### Design implications

- **Resist per-user customization.** Every "let users edit the template" feature is a knife pointed at Marcus's consistency goal. When we ship customization, scope it tightly and make the *org default* the strong path.
- **Built-in templates are a product, not a default to overwrite.** Keep them read-only, keep Clone visible, and treat the built-in library as something we own and improve.
- **Surface the security model in one place, in one paragraph.** Don't make Marcus piece it together from invariants.md.
- **Cost ceilings belong server-side.** Per-key abuse caps, per-session length caps, surfaced as friendly UX ("this recording is approaching 90 minutes — split it?") not silent failures.
- **Future multi-user thinking** (when we get there): the unit of policy is the *organization*, not the clinician. Templates, exercises, retention defaults flow down; clinicians can clone but not override the org standard.
- **Anything that helps Dana ship a consistent note also helps Marcus.** When the two personas align, the feature is right. When they conflict, Dana wins on the recording-and-note-shipping path; Marcus wins on the template-and-policy path.

---

## How to use this doc

When proposing a change, write one line for each persona:

> **Dana:** Faster — one fewer tap before record.
> **Marcus:** Neutral — doesn't touch template or PHI handling.

If a change is "Dana: faster, Marcus: worse" (e.g., letting clinicians edit org templates inline), pause and route the decision through the owner explicitly. If it's "Dana: neutral, Marcus: neutral," it probably isn't worth shipping.
