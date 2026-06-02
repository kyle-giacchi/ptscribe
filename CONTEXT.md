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

All three converge on the same state machine after Capture (Curate → Generate → Finalize) with the same [note-staleness](#note-staleness) semantics after Generate. The differences are only in _how the transcript gets into the system_.

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

The set of data sent to the note-generation AI. Bounded to: the curated transcript + the chosen template (structure, section keys, labels, prompt hints, system prompt) + the visit type + the patient context block (a pseudonym ID `PT-<id-slice>`, age derived from `dob`, `sex`, and the clinician-authored `primaryDiagnosis` label). The patient's name, MRN, **ICD-10 code, and free-text patient notes are _not_ sent** — name is replaced by the pseudonym, and the coded/free-text identifiers are withheld entirely (A9; see `buildUserPrompt` in `src/lib/clinical/prompts.ts`). **Prior session content (previous Notes, Plan of Care, prior goals, prior exercises) is never injected.** If a clinician wants any of those in the prompt, they paste it into the curated transcript themselves during Curate.

The clinician is trusted to know what is in the transcript and what is in the template — both are visible in the existing UI (Curate panel + session settings). No separate "Sending to AI" preview surface is required.

The bound is strict because the curated transcript is the contract: the AI is only asked to summarize what the clinician explicitly approved for this session. The patient context block is identity scaffolding (so the AI uses correct pronouns and clinical framing); it never substitutes for what the clinician put in the transcript.

## Visit type vs. template

A session carries two independent fields:

- **Visit type** (`'evaluation' | 'follow_up' | 'progress' | 'discharge'`) — clinical/billing metadata describing the _kind of encounter_. Used for filtering and reporting. Editable at any time including post-Finalize; not locked at Generate. Sent to the AI as one signal.
- **Template** — the structure + prompt that shapes the Note output. Sent to the AI as a separate signal. Switchable until Finalize; changing it after Generate flags the Note [stale](#note-staleness) (see [Template selection](#template-selection)).

The two are deliberately decoupled so a custom template ("Cash-pay shoulder eval") can be used with any visit type, and filtering by visit type works independently of template choice.

### Default templates per visit type

Two user-level settings live under Settings → Defaults:

- **Default template for Initial Visit** — auto-stamped when an `evaluation` session is created.
- **Default template for Follow-up appointment** — auto-stamped when a `follow_up` session is created.

`progress` and `discharge` sessions default to their matching built-in templates (Progress, Discharge) and can be overridden per-session like any other template choice. The clinician can swap the auto-stamped template freely until Generate fires.

## Template selection

A session is stamped with a `templateId` at creation based on visit type and the user's default-template settings (see above). The template is **freely switchable at any point before Finalize** — pre-Capture, during Curate, and after Generate. Switching the template while a Note has content shows a confirm ("will clear the text you've written"), because the Note's section blocks are keyed to the _current_ template's sections; the clinician then Regenerates against the new template.

Rationale: the template is part of the [Generation input](#generation-input) bound — its section keys, prompt hints, and systemPrompt all shape what the AI was asked to produce. The audit guarantee — a Note generated against template X never silently claims to be a Note for template Y — is preserved **structurally** rather than by a lock: each Note records its own `templateId` snapshot (alongside the transcript and modifiers it was generated from). If the session's live template later differs from that snapshot, the Note is [stale](#note-staleness) and Finalize is gated.

Post-Finalize template switching is disabled. The Note is the legal artifact and its template is part of its identity. The path is Re-open (unfinalize) → switch template → Regenerate.

## Note staleness

There is **no locked-transcript state**. After Generate, the transcript stays fully editable — edits, Improve with AI, and Scrub PII all remain available. The integrity guarantee instead rides on an **immutable snapshot stored on the Note**: at generation time the Note records the exact `generatedFromTranscript`, `templateId`, and `modifiers` that produced it. That snapshot is what grounds the Note for audit, and it is never mutated by later transcript edits.

A Note is **stale** when a generation input — transcript text, template, or modifiers — has since diverged from that snapshot (`isNoteStale` in `services/note/staleness.ts`, the inverse of the Regenerate soft-gate's `noteMatchesInputs`). While a Note is stale:

- A caution banner appears on the Note editor: _"Generated from an earlier version of the transcript — regenerate to sync, or finalize as-is."_
- **Finalize is gated.** Attempting to finalize a stale Note opens a confirm with three choices: **Cancel**, **Regenerate** (re-run the AI on the current inputs so the Note matches), or **Finalize anyway** (an explicit acknowledgment that the recorded Note is what the clinician wants, even though the live transcript has since changed).

This is the deliberate design choice (see the PRODUCT principle "when a decision trades clinician control for system rigor, default to clinician control"): rather than freezing the transcript and destroying the Note on an "unlock," the clinician keeps both their transcript edits and their Note edits, and the only hard barrier is the explicit acknowledgment at Finalize.

## Finalize

The clinician's commitment that the Note represents their clinical reasoning. Finalize is always available — the system does not block it on any structural check. If required sections (per the template) are empty, a soft confirmation dialog lists them ("Finalize anyway?") before proceeding. On confirm: the Note is marked finalized with a timestamp and the Note editor becomes read-only. **Re-open** is freely available; flipping the Note back to editable carries no system penalty. Post-finalize edits are tracked (first-edit timestamp + edit count) and surfaced in the Note metadata as the clinician's own audit trail — informational, not enforced.

## Clips

Per-recording-take audio segments within a session. Created during Capture: pause/resume keeps the clinician in one clip; "Stop & Start New" creates an additional clip (e.g. patient stepped out). Clips are visible:

- **During Capture** — recording panel shows clip count + scrub, clinician chooses whether to pause or stop-and-start-new.
- **During Curate / Review** — the ClipsDrawer (side drawer ≥ 768 px / bottom sheet < 768 px) surfaces clips as a _diagnostic tool_. The clinician opens it when something in the curated transcript looks wrong and they want to listen to the specific clip that produced it.

The curated transcript is one continuous artifact; the AI receives one transcript; the Note is generated from one transcript. Clips never partition the transcript. The ClipsDrawer's role is to help the clinician investigate mismatches, not to structure the workflow.

## Recording controls

Inside a live Recording session the clinician has four primary controls:

- **Pause / Resume** — stays inside the current clip. T1 keeps accumulating, WAL chunks keep flushing, wake lock stays held. A "Paused" badge is the only visible state change.
- **Stop & Start New** — commits the current clip (audio finalized in IDB, T1 frozen for that clip) and starts a new clip immediately. T2 is **not** triggered yet — T2 only runs after the final Stop, against the combined silence-removed blob across all clips.
- **Delete clip (pre-Stop)** — the clinician can drop a clip before the final Stop (e.g. Clip 2 captured the waiting room). Deleted clips are purged from IDB and excluded from the combined blob.
- **Stop** — ends recording. Triggers Capture-end pipeline (consolidate clips → silence-remove → T2 → navigate to Curate).

### Re-opening Capture from Curate

While in Curate (transcript unlocked), the clinician can hit **Add recording** to spawn a new clip. The pipeline re-runs against _all_ clips combined — silence-remove + T2 — and the resulting transcript **replaces** the current curated transcript. Mid-Curate edits to the transcript are lost in this operation; a hard warning ("your edits will be replaced") confirms before proceeding.

Append-only ("just add the new clip's text to the end") is explicitly rejected: silence-removal and chunking operate on the whole combined blob, so re-running T2 on the union is the only way to produce coherent text.

Add recording remains available after Generate. Because it re-runs T2 and **replaces** the transcript, the existing "your edits will be replaced" warning applies, and the replaced transcript makes the existing Note [stale](#note-staleness) — surfaced by the stale banner and the Finalize gate. The clinician is not blocked from capturing more audio; they are simply prompted to Regenerate (or finalize as-is) afterward.

## Audio Upload

Entry point #2. The clinician provides one or more existing audio files instead of recording live.

- **Accepted formats:** mp3, wav, m4a, webm, ogg (decoded via the browser's WebAudio API). Other types are rejected with an explicit error.
- **Size / duration:** soft-warn at 60 minutes total, hard-block at 120 minutes total. The hard limit protects against pathological inputs; the soft warn is informational.
- **Multi-file:** supported. Each uploaded file becomes its own clip (same model as "Stop & Start New"). The combined silence-removed blob is built across all clips, identical to the Recording pipeline.
- **Silence-removal runs.** Uploaded audio is _not_ trusted as already-tight — it goes through the same pipeline as Recording so T2 chunking and prompt sizing assumptions hold.
- **Original uploaded file is preserved as the clip's per-clip audio** through Curate / Generate, and is pruned at Finalize per the standard [audio retention](#audio-retention) policy. This lets the clinician delete unneeded clips post-upload (same affordance as Recording).

No live preview is shown during upload (no real-time T1 source exists). The clinician is shown a progress indicator while the upload processes, then T2 runs against the combined silenced blob exactly as in Recording, and the clinician is navigated to Curate only once T2 lands.

## Audio retention

Two-stage automatic retention model:

| Stage              | Trigger                  | What is kept                                                                             | What is dropped                                 |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Pre-Finalize       | Any time before Finalize | All per-clip audio + WAL chunks + silenced+combined audio (produced by Capture pipeline) | Nothing automatic                               |
| At Finalize        | Note is finalized        | Silenced+combined audio Blob only                                                        | Per-clip audio + WAL chunks                     |
| Finalize + 14 days | Background sweep         | Transcript text + Note only                                                              | Silenced+combined audio Blob (full audio purge) |

After full purge, the Note and its transcript remain intact; Improve with AI is no longer available for the session. The clinician's existing right to delete a session entirely (which deletes everything including transcript and Note) is unchanged.

**Implementation status (current):** The sweep (`purgeFinalizedAudio`, run at boot when `Settings.retention.autoDeleteAudioAfterDays` is enabled) is **finalize-gated** — it only ever removes audio for sessions whose `status === 'finalized'`, anchored on the persisted `Session.finalizedAt`. Active/draft sessions keep all clip audio regardless of age, so Improve-with-AI and Revert always work mid-visit. The implemented policy is the simplest faithful form: a finalized session's per-clip audio is dropped on the next sweep (the day-count acts as an on/off switch, not a delay), and the silenced+combined Blob is **not** persisted — the "keep combined blob for the window / drop at +14 days" rows above are the _designed_ target, not yet built. (The earlier blunt age-sweep keyed off `clip.createdAt` and could delete audio for an active, pre-Finalize session — that bug is fixed.)

## Note editor

The Note draft is presented as **section blocks** — one editable text block per template section, labeled by the template's section label. Required sections carry a small "Required" tag (informational only). During Generate (or Regenerate), the entire Note draft is produced atomically: the AI returns the full formatted response in one shot, the sections populate together, no progressive streaming reveal. The clinician edits each section freely after the draft lands.

The transcript is visible adjacent to the Note (panel or collapsible reference) so the clinician can scan it without context-switching while editing. It stays editable — see [Note staleness](#note-staleness); editing it after Generate flags the Note stale rather than being blocked.

Top-level actions while editing: **Regenerate** (with Modifier chips), **Finalize**. No per-section regenerate — Regenerate is always Note-level (entire draft replaced). When the Note is stale, the editor shows the stale banner and Finalize routes through the stale-confirm.

## Regeneration

Re-running the AI on the current transcript to produce a new Note draft, replacing the existing one (with a "your edits will be lost" confirmation). Regenerating also re-stamps the Note's input snapshot, clearing any stale state.

### Soft-gate

The Regenerate button is **disabled** after a Note exists if neither the transcript nor the active Modifiers have changed since the last generation — re-running would produce an identical result. The button shows a tooltip: _"No changes to transcript or modifiers since last generation."_

Regenerate becomes enabled again the moment either input changes: the clinician edits the transcript or adjusts any Modifier chip or Custom instruction. (The same input-change signal is what marks the Note [stale](#note-staleness).)

## Modifier

A clinician-supplied instruction that augments the AI prompt without changing the transcript. Modifiers steer the AI's _style_ or _emphasis_ and can be set before the first Generate or before any Regeneration.

Form: two chip categories plus one free-text slot:

- **Tone** (single-select, nothing active by default): Narrative · Terse · Clinical / Formal. Replaces the former standalone `toneStyle` field — if no Tone chip is selected the base template prompt is used without a tone block.
- **Emphasis** (multi-select, all off by default): More detail · Focus on functional outcomes · Highlight patient progress.
- **Custom instruction** (optional, length-capped free text, one slot).

Active modifiers are appended to the system prompt by the Worker at generation time. They are persisted with the resulting Note draft for audit (each Note records the exact modifiers that produced it, alongside the transcript snapshot). Modifiers persist on the Session until the clinician clears them or a new session starts — they are **not** reset by Regenerate.

## Improve with AI

The single AI-assist action available during Curate. It re-transcribes the original audio with cloud Nova and replaces the current transcript text. Warns hard if the clinician has hand-edits ("this will replace your edits"). Only available if audio exists for the session. No text-only cleanup action — disfluencies and filler words are removed by the clinician manually if at all.

### Cloud-transcription cap

Each session gets **one** Nova run, total. The counter is per-Session, persisted with the entity, and is **not** reset by Revert to original, page reload, or any other client action. The same counter is consumed by:

- An explicit "Improve with AI" click in Curate, and
- Choosing "Re-transcribe with cloud AI" from the T2-failure dialog at the end of Capture.

After the budget is spent the action disappears (or shows a disabled-with-tooltip state): _"Cloud transcription was already used for this session."_ The clinician still has the local transcript (T2 or T1 fallback) and manual editing to work with — they are not blocked from finishing the note. Server-side abuse caps in the Worker remain the org-level safety net.

## Scrub PII

A manual, clinician-triggered action during Curate. The clinician clicks "Scrub PII" to open the PII review modal. Inside the modal they click "Scan for PII" to trigger on-device NER detection — the scan is deliberately a second step so the clinician confirms scope before processing. The modal shows an inline diff of exactly what will change: original text with detected entities struck through, replacement placeholders highlighted. The clinician reviews and clicks "Apply N redactions" to write the scrubbed text to the Edited transcript tier, or closes the modal to discard.

No automatic scrubbing at T2 land or at Generate — the system never silently rewrites the clinician's text. Scrubbing is entirely local (no network); the result is editable like any other text — the clinician can adjust placeholders if the detector got something wrong. The original machine transcript is preserved as a fallback (Revert to Draft).

## Vault and the recording workflow

The vault unlock model is **tab-lifetime, no idle timeout**. The clinician unlocks once at app load (passphrase or passkey), and the in-memory key persists until tab close. No mid-session re-authentication exists; a recording in progress is never interrupted by a vault prompt.

Implications for the workflow:

- Cold-open before recording: vault prompt is the first thing the clinician sees. Passkey is the fast path when a patient is already in the room; passphrase is the fallback.
- WAL chunks, per-clip audio, the combined silenced blob, and the curated transcript all round-trip through the Repository encryption boundary normally — no second persistence path, no unencrypted staging area.
- Tab close evicts the key. The two consequences (existing recordings become unreadable to an attacker; the legitimate clinician must re-unlock on next visit) are intentional.
- **Passphrase recovery** exists via a **Recovery code** (see below and ADR-0003): a forgotten passphrase is no longer terminal — the recovery code unlocks this device or restores a portable backup elsewhere. (Demo mode does not surface it; the vault auto-unlocks there.)

Idle-timeout vault relocking is **not** a default behavior. If introduced later it would be an opt-in setting and would need to define WAL-chunk behavior during the locked window.

**Recovery code** (ADR-0003):
A high-entropy code (160 bits, shown once at vault setup with a mandatory acknowledgement) that wraps the same DEK as the passphrase, so a forgotten passphrase is not terminal. Regenerable from Settings (invalidates the old one) and survives passphrase changes — it wraps the DEK, not the passphrase. It is **not** a second passphrase and is **not** a cloud-stored secret — recovery stays entirely on-device.
_Avoid_: backup password, reset code, recovery key (reserve "key" for the DEK/KEK).

**Portable backup** (ADR-0003):
A self-contained v2 backup file whose DEK is wrapped by both the passphrase and (if set) the recovery code, so it can be restored on **any** device with either secret. The backup **file** (not a server) is the cross-device transport. Distinct from the same-device-only v1 encrypted backup, which is still importable.
_Avoid_: cloud backup, sync (PTScribe does not sync clinical data to a server).

## Profiles and multi-user devices

A **Profile** is a cryptographically-isolated partition of _all_ on-device data — its own [vault](#vault-and-the-recording-workflow) (passphrase + DEK), its own AppData, audio, and audit log. One profile's DEK cannot decrypt another profile's data; isolation is cryptographic, not a UI filter. A device (browser profile) can hold several Profiles, but only one is unlocked at a time.

Three kinds, distinguished by how the Profile is identified:

- **Default local profile** — the single Profile that **not-logged-in** (anonymous, local-first) use always lands in. There is exactly one; PTScribe is fully usable here with no cloud account. Two anonymous clinicians on the same device share this one Profile — separation requires logging in.
- **Authenticated profile** — keyed to a registered user's account identity. The **same account always maps to the same Profile** on a given device, and is the only kind that participates in [config sync](#account-config--sync). Multiple registered users on one device each get their own Authenticated profile, mutually undecryptable.
- **Reserved test Profiles** — [Demo mode and Test User](#demo-mode) are **two separate** reserved Profiles (`demo` and `test-user`), each isolated from the other and from every real Profile. Neither syncs; neither shares storage with a real Profile, and they do **not** share storage with each other. (This supersedes the older "demo and real data share one namespace / Demo and Test User are one `DEMO_USER` identity" behavior — they now diverge at the storage layer even though they still share the `DEMO_USER` _auth_ identity.)

Logging in is therefore an **act of selecting/creating a Profile**, not a precondition for using the app. Clinical data still never leaves the device; Profiles are about _separating_ on-device data between people who share a device, not about moving it to a server.

Switching into a Profile **never migrates or merges** data from another Profile: logging into an account selects (or, first time, creates empty) that account's Profile; it does not adopt whatever the anonymous local Profile was holding. Moving clinical data between Profiles is only ever done by the clinician via an explicit [portable backup](#vault-and-the-recording-workflow) export/import.

_Avoid_: "account" or "tenant" as a synonym for Profile — a Profile is the on-device encryption partition; an account is the cloud identity that may _bind_ to one.

## Interruption and recovery

The clinician's session can be interrupted at any phase. The contract is **never silent**: every recovery path surfaces what happened and lets the clinician choose how to proceed.

### Mid-Recording crash

If the tab is closed or the browser crashes during active recording, WAL chunks already in IndexedDB are preserved. On next app open, the system detects orphan WAL chunks and shows a one-time recovery dialog:

> _"We found unfinished recording from [patient] on [date]. Recovered audio is [X minutes Y seconds] long; the last chunk was captured at [timestamp]."_
> Buttons: **Recover as new clip** · **Discard**

On Recover: chunks are consolidated into a normal clip, the session opens in its prior phase (typically Capture, ready for the clinician to Stop or Add recording), and the standard Capture-end pipeline runs from there. On Discard: chunks are purged from IDB.

The dialog shows the recovered length and last-captured timestamp explicitly so the clinician knows how much audio survived — silent reconstruction is rejected because it hides the failure.

### Mid-Curate navigation

Curate-phase transcript edits are persisted on every meaningful change (debounced through the single write path) so navigating away and returning shows the in-progress edited text intact. This is a property of the existing persistence layer, not a new feature.

### Mid-Generate crash

If `session.status === 'generating'` but no AI response landed, on return the clinician sees:

> _"Note generation was interrupted. Retry?"_
> Buttons: **Retry** · **Cancel**

Generate is **not** silently re-fired — provider charges are per request initiated and the clinician must make the choice. On Cancel the session returns to its pre-Generate state (no Note draft; the transcript is unchanged and still editable).

### Post-Finalize return

A finalized session opens directly into its read-only Note view with **Re-open** available. No special recovery UI — this is the normal finalized state.

## Notification and error surfaces

How the app tells the clinician something happened. The "never silent" contract (see [Interruption and recovery](#interruption-and-recovery)) requires every notable event to reach the clinician — and the corollary is **one event uses one surface**: the same event is never announced in two places at once.

Which surface a message uses is decided by two questions: _did the clinician just trigger it, in their current focus?_ and _does it require an action to move forward?_ Five canonical surfaces:

- **Toast** — a transient, auto-dismissing confirmation of an in-context action the clinician just took ("Transcript copied", "Note copied"). Never used for anything actionable or anything that must persist.
- **Inline alert** — a failure or notable outcome anchored to the artifact or affordance it concerns. A generation failure sits under the Note; a transcription failure sits under the transcript; a Note that generated with all sections empty shows a note-anchored alert (usually a section-key mismatch or thin transcript) with Regenerate; an unavailable audio playback shows a quiet informational notice on the player / ClipsDrawer. Actionable cases carry the retry/recovery action in place; non-actionable degradations use an informational tone, not a red alert. A "No speech detected — type your transcript" banner in the Curate panel is the inline form used when no usable transcript was produced.
- **Blocking dialog** — a decision the clinician must make before continuing (the T2-failure choice, the PHI confirmation, the local-Whisper-unavailable recovery).
- **Alerts** — the persistent "Warnings & Errors" list in the top nav (the bell). Holds only ambient, cross-session events the clinician did not directly trigger and can review later: background transcription finished, low device storage, sessions reopened after a crash. A failure specific to the artifact or affordance the clinician is currently working on does _not_ go here — it is an Inline alert.
- **Page banner** — a persistent, session-wide failure that is _not_ tied to a single artifact. Reserved for storage/persistence write failures ("your edits may not be saved") — severe enough that a transient toast would be insufficient. (Unclassified failures of a specific action belong in that action's Inline alert, not here.)

### Pointer to an off-screen inline alert

An Inline alert is the source of truth for an actionable failure, but its host can be hidden — the transcript may be collapsed, or the alert may be scrolled out of view. Because a missed transient toast would leave a persistent failure silent (violating the never-silent contract), the off-screen cases are handled differently:

- **Scrolled away (still on screen):** a one-time toast points to the alert; acting on it scrolls the alert into view.
- **Collapsed transcript (alert not on screen at all):** a **persistent error badge** on the collapsed-transcript tab stays until the failure resolves, plus a one-time toast when it first occurs. Either one expands the transcript and scrolls to the Inline alert.

A transient toast is never the _only_ indicator of a persistent error.

## Demo mode

Demo mode (`VITE_DEMO_MODE=true`) is intended as a **fresh-patient experience** — a clinician trying the app should walk through the real workflow end-to-end against their own audio, not a canned scripted demo. The contract:

- **Vault auto-unlocks**, first-run wizard is skipped, and a demo patient + a sample session are seeded into the demo [Profile](#profiles-and-multi-user-devices). Demo runs in its own isolated `demo` Profile — it does **not** share `ptnotes.appData` / `ptnotes-audio` with a real Profile or with the `test-user` Profile. The persistent "DEMO MODE" badge is still shown as a defensive signal.
- **Note generation hits the real Anthropic Worker on the [shared key](#generation-providers--api-keys-byok).** Demo is the **only** path that uses PTScribe's own provider key; a clinician trying the app needs to see the actual AI output for the audio they recorded. The cost is bounded by the clinician's own input rate. (Real, non-demo generation uses the user's or org's own key — see below.)
- **T2 local Whisper runs normally** — it's free and is the local-pipeline showcase.
- **Cloud transcription (Nova) is hard-disabled.** "Improve with AI" in Curate and "Re-transcribe with cloud AI" in the T2-failure dialog are both unavailable with an explanatory tooltip (_"Cloud transcription is disabled in demo mode."_). This is the single largest provider cost and is the deliberate exclusion.
- **Persistent "DEMO MODE" badge** sits in the top nav on every screen — defensive against the failure mode of someone running a demo build with real patient context.

`VITE_DEMO_MODE=false` is required for production builds (existing hard rule).

### Test User vs Demo mode

The `VITE_DEMO_MODE` flag currently switches on **two distinct entry experiences** that share the flag _for now_ but are conceptually separate:

- **Demo mode** — the _guided showcase_. Entered via **Try Demo**. The user is dropped into a single seeded demo session and **kept there** (navigation is locked to that session); a Demo Patient + sample session are pre-seeded. This is the canned-walkthrough surface.
- **Test User** — the _full real-app experience_. Entered via **Login as Test User** on the sign-in screen. Navigation is **not** locked — the user roams the whole app (dashboard, patients, notes, templates, etc.) as in the real product. The app starts **clean**: only the clinician is seeded (no demo patient or sample session). The vault still auto-unlocks with the shared demo passphrase and the "DEMO MODE" badge still shows, because the underlying build is still the demo build — but the _behavior_ is the unconstrained app, not the locked walkthrough.

Both share the `DEMO_USER` _auth_ identity and both are unavailable when `VITE_DEMO_MODE=false`, but they are **separate [Profiles](#profiles-and-multi-user-devices)** at the storage layer (`demo` vs `test-user`) and never bleed into each other. The runtime signal that selects between them is the **persistent "test user" marker** (localStorage) set by the Login-as-Test-User action and cleared by **Log out** — so a Test User session behaves like a real login: it survives reloads and new tabs until the user explicitly logs out, and it reads/writes only the `test-user` Profile's storage. **Log out** is a full exit: it locks the vault, clears the test-user marker and the AppGate code, and returns to the Landing/sign-in screen.

## Account config & sync

Vocabulary for the cross-device persistence of a registered user's **non-clinical** account data. This is account infrastructure, not part of the clinician workflow — but the terms appear in code, UI, and PRs. (Implementation lives in [architecture.md — Cross-device config sync](docs/architecture.md#cross-device-config-sync-d1) and [invariants.md — D1 config sync](docs/invariants.md#d1-config-sync--clinical-exclusion-has-exactly-one-chokepoint).)

- **User config** — the per-user bundle that syncs to the cloud for a signed-in (non-demo) user: the `settings` subtree, the `clinician` profile, and the clinician's **custom** (non-built-in) templates and exercises. Nothing else. Patient data, sessions, notes, plans, and audio are **never** part of user config.
- **Org config** — an organization's shared, owner/manager-editable settings: an org **policy** blob (e.g. default template) plus a **shared library**. Members inherit it read-only.
- **Shared library** — the org-owned set of templates/exercises every member sees. They behave **like built-ins but sourced from the org**: badged "Org", read-only, offered as **Clone** (not Edit). They are never copied into the user's own data unless the clinician clones one.
- **Config sync** — the local-first mirror that keeps user/org config in step across a clinician's devices: **last-write-wins** (newer wins), push-on-change, pull-on-login. It is **not** clinical-data sync — PTScribe never syncs patient records or audio to a server. The demo user is fully isolated and never syncs.
  - _Avoid_: "cloud backup" or "sync" as a blanket term — reserve "config sync" for this non-clinical path so it is never confused with clinical data leaving the device.

## Generation providers & API keys (BYOK)

Vocabulary for who supplies the AI credential that bills note generation. Note generation is the **only** AI step covered by BYOK — cloud transcription (Nova) stays on PTScribe's own account. Like [Account config & sync](#account-config--sync), these are account-infrastructure terms, not part of the clinician workflow, but they appear in code, UI, and PRs.

- **Generation provider** — the AI service that produces a Note: **Anthropic**, **OpenAI**, or **Google**. Each clinician selects one as their [active provider](#generation-providers--api-keys-byok); the chosen provider and model ride [config sync](#account-config--sync), but the keys never do.
- **Active provider** — the user's currently selected generation provider + model. Drives which key is looked up at Generate time.
- **Personal key (BYOK)** — a registered user's own provider API key. Stored server-side (never returned to the browser after entry), used to bill that user's own provider account. Required for real (non-demo) generation.
- **Org key** — an organization-provided provider key set by a manager. Inherited by org members who have no personal key for the active provider, so an invited clinician need not create their own provider account.
- **Key resolution order** — at Generate time: **personal key → org key → blocked**. With no usable key, the Generate action is blocked with a prompt to add one (it does not silently fall back to the shared key).
- **Shared key** — PTScribe's own provider key. **Demo-only** (see [Demo mode](#demo-mode)); never used for real generation.
- **Verified key** — a key confirmed by a live validation call to its provider before being stored. The UI shows verified vs. unverified status; a key is never silently invalidated on a later runtime error.
  - _Avoid_: "API key" unqualified when the distinction matters — say **personal key**, **org key**, or **shared key**.

## Primary success criterion

**Quality of the final Note**, where "quality" is **defined by the clinician, not the system**. The workflow is optimized so the clinician arrives at a Note they personally judge to be defensible — even at the cost of additional time, network calls, or clinician effort. The system does not enforce a quality standard.

> Implications:
>
> - Finalization is the clinician's _assertion_ of defensibility, not a system gate that proves it.
> - Required-section guards, audit trails, and "Not assessed" prompts are **aids to the clinician's process**, not enforcers of an external bar.
> - Templates, AI prompts, and tier defaults can be overridden by the clinician at any point.
> - When a design decision trades clinician control for system rigor, the default is clinician control.
