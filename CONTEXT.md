# PTScribe — Context Glossary

A shared vocabulary for the PTScribe core workflow (Recording → Transcription → Note Generation). This file is a glossary, not a spec. Implementation details belong elsewhere.

## Core workflow

The end-to-end clinician journey, in four phases:

1. **Capture** (system-active): clinician records or uploads audio; the system produces a transcript automatically.
2. **Curate** (clinician-active): clinician edits the transcript — refining transcription errors and/or scrubbing PII — until they consider it ready to hand to the AI.
3. **Generate** (system-active): clinician triggers AI note generation; the AI only ever sees the curated transcript.
4. **Finalize** (clinician-active): clinician reviews the Note draft, edits as needed, and Finalizes — asserting it represents their clinical reasoning.

The Note is the legal artifact, but the **curated transcript is the contract** between clinician and AI: the AI is bound to summarize only what the clinician approved.

## Transcript

The single piece of text the clinician sees during Curate. Internally the system maintains multiple machine-produced versions (live preview compiled during recording, post-stop local pass on combined+silence-removed audio, opt-in cloud pass) plus the clinician's edits, but those are storage concepts — not concepts the clinician learns. The clinician sees one transcript and three named actions: **Improve with AI**, **Revert to original**, **Scrub PII**. The Admin page is a power-user diagnostic and not part of the core workflow.

The transcript the clinician begins curating is the post-stop local-Whisper output (T2), produced against the combined, silence-removed session audio. T2 must complete before the clinician is navigated to the Curate page — no Curate UI with an in-flight "transcribing..." indicator. The live preview transcript (T1, compiled from per-segment captures during recording) is preserved for diagnostic purposes but is not the clinician's starting point in Curate.

## Session entry points

Three named ways to start a session, presented as primary choices at session creation:

1. **Recording** — capture a live visit with the mic; in-app real-time live preview, T2 transcription on stop.
2. **Audio Upload** — provide an existing audio file; no live preview, T2 transcription runs on the uploaded blob.
3. **Skip / Manually type** — no audio at all; clinician types or pastes the transcript directly and proceeds to Curate.

All three converge on the same state machine after Capture (Curate → Generate → Finalize) with the same Lock-at-Generate semantics. The differences are only in *how the transcript gets into the system*.

## Capture phase

Applies to entries 1 and 2 (Recording and Audio Upload). The clinician records (or uploads) one or more clips for the session. During recording, near-real-time live transcription runs in the panel as a confidence + reassurance signal and is compiled into a stored T1 transcript. Audio Upload skips the live preview (no real-time signal). On stop / on upload complete, the system:

1. Consolidates clips into a combined, silence-removed audio blob.
2. Runs local Whisper (T2) on that blob.
3. Only after T2 lands, navigates the clinician into Curate.

Capture is "active" — the system is doing work the clinician can see (live preview) and work the clinician trusts is happening (T2). The clinician is not asked to wait inside the Curate UI.

Entry 3 (Skip / Manually type) bypasses Capture and goes directly into Curate with an empty editable transcript. "Improve with AI" is hidden in this path (no audio to re-transcribe).

### T2 failure handling

T2 failure is a visible moment in the flow — never silent. On model-load error, exhausted retries, hard timeout, or worker crash, the system surfaces an explicit dialog at the end of Capture with two paths forward: **Re-transcribe with cloud AI** (Nova; counts against the cloud-transcription rate limit) or **Proceed with live preview as transcript** (uses T1; surfaces an inline banner in Curate noting the source). Empty / no-speech-detected is **not** a failure — the clinician is navigated into Curate with an empty editable transcript and an inline note.

## Session creation

A session is always owned by a Patient — patient selection is a hard prerequisite to starting a session. The creation flow is: **pick patient → pick visit type → pick entry point** (Recording / Audio Upload / Skip-Manual). Orphan / unassigned sessions do not exist. The patient-picker is a typeahead with recents; selecting a patient also surfaces their Plan of Care and prior sessions adjacent to the workflow as reference material the clinician can copy from into the curated transcript (the AI itself never receives any of it — see [Generation input](#generation-input)).

## Curate panel

The clinician's primary working surface during Curate. Layout stays close to the existing Review-page design — full-width editable transcript with the three named actions (**Improve with AI**, **Revert to original**, **Scrub PII**) and the ClipsDrawer toggle preserved in SessionTopBar. The new state machine adds only the minimum visible changes: a banner slot for "T1 fallback in use" or "No speech detected — type your transcript", and the read-only locked-transcript state once Generate fires. A larger layout rethink is explicitly deferred.

## Generation input

The set of data sent to the note-generation AI. Bounded to: the curated transcript + the chosen template (structure, section keys, labels, prompt hints, system prompt) + the visit type + the patient context block (first/last name, age derived from `dob`, `primaryDiagnosis`). MRN and ICD-10 are **not** sent. **Prior session content (previous Notes, Plan of Care, prior goals, prior exercises) is never injected.** If a clinician wants any of those in the prompt, they paste it into the curated transcript themselves during Curate.

The clinician is trusted to know what is in the transcript and what is in the template — both are visible in the existing UI (Curate panel + session settings). No separate "Sending to AI" preview surface is required.

The bound is strict because the curated transcript is the contract: the AI is only asked to summarize what the clinician explicitly approved for this session. The patient context block is identity scaffolding (so the AI uses correct pronouns and clinical framing); it never substitutes for what the clinician put in the transcript.

## Visit type vs. template

A session carries two independent fields:

- **Visit type** (`'evaluation' | 'follow_up' | 'progress' | 'discharge'`) — clinical/billing metadata describing the *kind of encounter*. Used for filtering and reporting. Editable at any time including post-Finalize; not locked at Generate. Sent to the AI as one signal.
- **Template** — the structure + prompt that shapes the Note output. Sent to the AI as a separate signal. Locked at Generate (see [Template selection](#template-selection)).

The two are deliberately decoupled so a custom template ("Cash-pay shoulder eval") can be used with any visit type, and filtering by visit type works independently of template choice.

### Default templates per visit type

Two user-level settings live under Settings → Defaults:

- **Default template for Initial Visit** — auto-stamped when an `evaluation` session is created.
- **Default template for Follow-up appointment** — auto-stamped when a `follow_up` session is created.

`progress` and `discharge` sessions default to their matching built-in templates (Progress, Discharge) and can be overridden per-session like any other template choice. The clinician can swap the auto-stamped template freely until Generate fires.

## Template selection

A session is stamped with a `templateId` at creation based on visit type and the user's default-template settings (see above). Template is **freely switchable until the first Generate** — pre-Capture and during Curate. Once Generate fires, the template is locked alongside the transcript: changing it requires Unlock (which destroys the Note draft) followed by a new template choice and Regenerate.

Rationale: the template is part of the [Generation input](#generation-input) bound — its section keys, prompt hints, and systemPrompt all shape what the AI was asked to produce. A Note generated against template X cannot claim to be a Note for template Y; changing the template after Generate would corrupt the audit trail.

Post-Finalize template switching is disabled. The Note is the legal artifact and its template is part of its identity. The path is Re-open → Unlock → switch template → Regenerate.

## Locked transcript

The state of the transcript after the clinician hits Generate. Once the transcript is locked:

- The transcript is read-only — no edits, no Improve with AI, no Scrub PII.
- The Note draft is the only editable artifact.
- The locked transcript text is the same text the AI received, preserved verbatim so the clinician (or a reviewer) can see exactly what grounded the Note.

To return to Curate, the clinician must explicitly **Unlock transcript**. Unlocking discards the current Note draft and reopens the transcript for editing, populated with the **last curated text** — verbatim what was sent to the AI. Unlock is a non-destructive reversal of Generate: the clinician resumes editing from where they left off, not from the original machine transcript. ("Revert to original" remains a separate named action inside Curate for clinicians who want to throw out their edits.) Unlocking is a deliberate barrier — it ensures the clinician treats "go back and recurate" as a costly decision (because the Note draft is destroyed), not an accidental click.

## Finalize

The clinician's commitment that the Note represents their clinical reasoning. Finalize is always available — the system does not block it on any structural check. If required sections (per the template) are empty, a soft confirmation dialog lists them ("Finalize anyway?") before proceeding. On confirm: the Note is marked finalized with a timestamp, the Note editor becomes read-only, and the transcript stays locked. **Re-open** is freely available; flipping the Note back to editable carries no system penalty. Post-finalize edits are tracked (first-edit timestamp + edit count) and surfaced in the Note metadata as the clinician's own audit trail — informational, not enforced.

## Clips

Per-recording-take audio segments within a session. Created during Capture: pause/resume keeps the clinician in one clip; "Stop & Start New" creates an additional clip (e.g. patient stepped out). Clips are visible:

- **During Capture** — recording panel shows clip count + scrub, clinician chooses whether to pause or stop-and-start-new.
- **During Curate / Review** — the ClipsDrawer (side drawer ≥ 768 px / bottom sheet < 768 px) surfaces clips as a *diagnostic tool*. The clinician opens it when something in the curated transcript looks wrong and they want to listen to the specific clip that produced it.

The curated transcript is one continuous artifact; the AI receives one transcript; the Note is generated from one transcript. Clips never partition the transcript. The ClipsDrawer's role is to help the clinician investigate mismatches, not to structure the workflow.

## Recording controls

Inside a live Recording session the clinician has four primary controls:

- **Pause / Resume** — stays inside the current clip. T1 keeps accumulating, WAL chunks keep flushing, wake lock stays held. A "Paused" badge is the only visible state change.
- **Stop & Start New** — commits the current clip (audio finalized in IDB, T1 frozen for that clip) and starts a new clip immediately. T2 is **not** triggered yet — T2 only runs after the final Stop, against the combined silence-removed blob across all clips.
- **Delete clip (pre-Stop)** — the clinician can drop a clip before the final Stop (e.g. Clip 2 captured the waiting room). Deleted clips are purged from IDB and excluded from the combined blob.
- **Stop** — ends recording. Triggers Capture-end pipeline (consolidate clips → silence-remove → T2 → navigate to Curate).

### Re-opening Capture from Curate

While in Curate (transcript unlocked), the clinician can hit **Add recording** to spawn a new clip. The pipeline re-runs against *all* clips combined — silence-remove + T2 — and the resulting transcript **replaces** the current curated transcript. Mid-Curate edits to the transcript are lost in this operation; a hard warning ("your edits will be replaced") confirms before proceeding.

Append-only ("just add the new clip's text to the end") is explicitly rejected: silence-removal and chunking operate on the whole combined blob, so re-running T2 on the union is the only way to produce coherent text.

Add recording is **disabled once Generate has fired** (transcript locked). To capture more audio post-Generate the clinician must Unlock first, which already destroys the Note draft — they are explicitly rewinding the workflow.

## Audio Upload

Entry point #2. The clinician provides one or more existing audio files instead of recording live.

- **Accepted formats:** mp3, wav, m4a, webm, ogg (decoded via the browser's WebAudio API). Other types are rejected with an explicit error.
- **Size / duration:** soft-warn at 60 minutes total, hard-block at 120 minutes total. The hard limit protects against pathological inputs; the soft warn is informational.
- **Multi-file:** supported. Each uploaded file becomes its own clip (same model as "Stop & Start New"). The combined silence-removed blob is built across all clips, identical to the Recording pipeline.
- **Silence-removal runs.** Uploaded audio is *not* trusted as already-tight — it goes through the same pipeline as Recording so T2 chunking and prompt sizing assumptions hold.
- **Original uploaded file is preserved as the clip's per-clip audio** through Curate / Generate, and is pruned at Finalize per the standard [audio retention](#audio-retention) policy. This lets the clinician delete unneeded clips post-upload (same affordance as Recording).

No live preview is shown during upload (no real-time T1 source exists). The clinician is shown a progress indicator while the upload processes, then T2 runs against the combined silenced blob exactly as in Recording, and the clinician is navigated to Curate only once T2 lands.

## Audio retention

Two-stage automatic retention model:

| Stage | Trigger | What is kept | What is dropped |
|---|---|---|---|
| Pre-Finalize | Any time before Finalize | All per-clip audio + WAL chunks + silenced+combined audio (produced by Capture pipeline) | Nothing automatic |
| At Finalize | Note is finalized | Silenced+combined audio Blob only | Per-clip audio + WAL chunks |
| Finalize + 14 days | Background sweep | Transcript text + Note only | Silenced+combined audio Blob (full audio purge) |

After full purge, the Note and its locked transcript remain intact; Improve with AI is no longer available for the session. The clinician's existing right to delete a session entirely (which deletes everything including transcript and Note) is unchanged.

Implementation note: today the silenced+combined Blob is computed for playback only and not persisted. The Finalize prune step requires it to become persistent — a small storage change.

## Note editor

The Note draft is presented as **section blocks** — one editable text block per template section, labeled by the template's section label. Required sections carry a small "Required" tag (informational only). During Generate (or Regenerate), the entire Note draft is produced atomically: the AI returns the full formatted response in one shot, the sections populate together, no progressive streaming reveal. The clinician edits each section freely after the draft lands.

The locked transcript is visible adjacent to the Note (panel or collapsible reference) so the clinician can scan it without context-switching while editing.

Top-level actions while editing: **Regenerate** (with Modifier chips), **Unlock transcript**, **Finalize**. No per-section regenerate — Regenerate is always Note-level (entire draft replaced).

## Regeneration

Re-running the AI on the same locked transcript to produce a new Note draft. The transcript stays locked; the existing Note draft is replaced (with a "your edits will be lost" confirmation).

### Soft-gate

The Regenerate button is **disabled** after a Note exists if neither the transcript nor the active Modifiers have changed since the last generation — re-running would produce an identical result. The button shows a tooltip: *"No changes to transcript or modifiers since last generation."*

Regenerate becomes enabled again the moment either input changes: the clinician edits the transcript (unlock → edit → relock) or adjusts any Modifier chip or Custom instruction.

## Modifier

A clinician-supplied instruction that augments the AI prompt without changing the transcript. Modifiers steer the AI's *style* or *emphasis* and can be set before the first Generate or before any Regeneration.

Form: two chip categories plus one free-text slot:

- **Tone** (single-select, nothing active by default): Narrative · Terse · Clinical / Formal. Replaces the former standalone `toneStyle` field — if no Tone chip is selected the base template prompt is used without a tone block.
- **Emphasis** (multi-select, all off by default): More detail · Focus on functional outcomes · Highlight patient progress.
- **Custom instruction** (optional, length-capped free text, one slot).

Active modifiers are appended to the system prompt by the Worker at generation time. They are persisted with the resulting Note draft for audit (each Note records the exact modifiers that produced it, alongside the transcript snapshot). Modifiers persist on the Session until the clinician clears them or a new session starts — they are **not** reset by Unlock.

## Improve with AI

The single AI-assist action available during Curate. It re-transcribes the original audio with cloud Nova and replaces the current transcript text. Warns hard if the clinician has hand-edits ("this will replace your edits"). Only available if audio exists for the session. No text-only cleanup action — disfluencies and filler words are removed by the clinician manually if at all.

### Cloud-transcription cap

Each session gets **one** Nova run, total. The counter is per-Session, persisted with the entity, and is **not** reset by Revert to original, Unlock, page reload, or any other client action. The same counter is consumed by:
- An explicit "Improve with AI" click in Curate, and
- Choosing "Re-transcribe with cloud AI" from the T2-failure dialog at the end of Capture.

After the budget is spent the action disappears (or shows a disabled-with-tooltip state): *"Cloud transcription was already used for this session."* The clinician still has the local transcript (T2 or T1 fallback) and manual editing to work with — they are not blocked from finishing the note. Server-side abuse caps in the Worker remain the org-level safety net.

## Scrub PII

A manual, clinician-triggered action during Curate. The clinician clicks "Scrub PII" to open the PII review modal. Inside the modal they click "Scan for PII" to trigger on-device NER detection — the scan is deliberately a second step so the clinician confirms scope before processing. The modal shows an inline diff of exactly what will change: original text with detected entities struck through, replacement placeholders highlighted. The clinician reviews and clicks "Apply N redactions" to write the scrubbed text to the Edited transcript tier, or closes the modal to discard.

No automatic scrubbing at T2 land or at Generate — the system never silently rewrites the clinician's text. Scrubbing is entirely local (no network); the result is editable like any other text — the clinician can adjust placeholders if the detector got something wrong. The original machine transcript is preserved as a fallback (Revert to Draft).

## Vault and the recording workflow

The vault unlock model is **tab-lifetime, no idle timeout**. The clinician unlocks once at app load (passphrase or passkey), and the in-memory key persists until tab close. No mid-session re-authentication exists; a recording in progress is never interrupted by a vault prompt.

Implications for the workflow:

- Cold-open before recording: vault prompt is the first thing the clinician sees. Passkey is the fast path when a patient is already in the room; passphrase is the fallback.
- WAL chunks, per-clip audio, the combined silenced blob, and the curated transcript all round-trip through the Repository encryption boundary normally — no second persistence path, no unencrypted staging area.
- Tab close evicts the key. There is no passphrase recovery. The two consequences (existing recordings become unreadable to an attacker; the legitimate clinician must re-unlock on next visit) are intentional.

Idle-timeout vault relocking is **not** a default behavior. If introduced later it would be an opt-in setting and would need to define WAL-chunk behavior during the locked window.

## Interruption and recovery

The clinician's session can be interrupted at any phase. The contract is **never silent**: every recovery path surfaces what happened and lets the clinician choose how to proceed.

### Mid-Recording crash

If the tab is closed or the browser crashes during active recording, WAL chunks already in IndexedDB are preserved. On next app open, the system detects orphan WAL chunks and shows a one-time recovery dialog:

> *"We found unfinished recording from [patient] on [date]. Recovered audio is [X minutes Y seconds] long; the last chunk was captured at [timestamp]."*
> Buttons: **Recover as new clip** · **Discard**

On Recover: chunks are consolidated into a normal clip, the session opens in its prior phase (typically Capture, ready for the clinician to Stop or Add recording), and the standard Capture-end pipeline runs from there. On Discard: chunks are purged from IDB.

The dialog shows the recovered length and last-captured timestamp explicitly so the clinician knows how much audio survived — silent reconstruction is rejected because it hides the failure.

### Mid-Curate navigation

Curate-phase transcript edits are persisted on every meaningful change (debounced through the single write path) so navigating away and returning shows the in-progress edited text intact. This is a property of the existing persistence layer, not a new feature.

### Mid-Generate crash

If `session.status === 'generating'` but no AI response landed, on return the clinician sees:

> *"Note generation was interrupted. Retry?"*
> Buttons: **Retry** · **Cancel**

Generate is **not** silently re-fired — provider charges are per request initiated and the clinician must make the choice. On Cancel the session returns to its pre-Generate state (transcript still locked, no Note draft).

### Post-Finalize return

A finalized session opens directly into its read-only Note view with **Re-open** available. No special recovery UI — this is the normal finalized state.

## Demo mode

Demo mode (`VITE_DEMO_MODE=true`) is intended as a **fresh-patient experience** — a clinician trying the app should walk through the real workflow end-to-end against their own audio, not a canned scripted demo. The contract:

- **Vault auto-unlocks**, first-run wizard is skipped, and a demo patient + a sample session are seeded into the same storage the rest of the app uses. There is no namespace split — demo and real data share `ptnotes.appData` and `ptnotes-audio`. The persistent "DEMO MODE" badge and the seeded-demo-patient affordance are the safeguards; clinicians who care about isolation should run a separate browser profile.
- **Note generation hits the real Anthropic Worker.** A clinician trying the app needs to see the actual AI output for the audio they recorded. The cost is bounded by the clinician's own input rate.
- **T2 local Whisper runs normally** — it's free and is the local-pipeline showcase.
- **Cloud transcription (Nova) is hard-disabled.** "Improve with AI" in Curate and "Re-transcribe with cloud AI" in the T2-failure dialog are both unavailable with an explanatory tooltip (*"Cloud transcription is disabled in demo mode."*). This is the single largest provider cost and is the deliberate exclusion.
- **Persistent "DEMO MODE" badge** sits in the top nav on every screen — defensive against the failure mode of someone running a demo build with real patient context.

`VITE_DEMO_MODE=false` is required for production builds (existing hard rule).

## Primary success criterion

**Quality of the final Note**, where "quality" is **defined by the clinician, not the system**. The workflow is optimized so the clinician arrives at a Note they personally judge to be defensible — even at the cost of additional time, network calls, or clinician effort. The system does not enforce a quality standard.

> Implications:
> - Finalization is the clinician's *assertion* of defensibility, not a system gate that proves it.
> - Required-section guards, audit trails, and "Not assessed" prompts are **aids to the clinician's process**, not enforcers of an external bar.
> - Templates, AI prompts, and tier defaults can be overridden by the clinician at any point.
> - When a design decision trades clinician control for system rigor, the default is clinician control.
