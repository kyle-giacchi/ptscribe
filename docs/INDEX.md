# Docs Index

Section-anchored map of every doc. Read with `Read tool offset:LINE limit:N` or open the link to jump straight to the section. Update when sections move.

## Quick lookup — "Where is X?"

| Topic                                                                    | File:Line                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Provider nesting order (ErrorBoundary → AuthProvider → VaultGate → AppDataProvider → … → IdleLockProvider → FirstRunGuard) | [invariants.md:5](invariants.md#provider-nesting-order) |
| Single write path (component → slice → AppDataProvider → DataRepository) | [invariants.md:25](invariants.md#single-write-path)                        |
| Schema validation rule (`safeParse` only on load/import)                 | [invariants.md:48](invariants.md#schema-validation-at-boundaries)          |
| Slice mutator pattern (`add` / `update` / `remove` / `set`)              | [invariants.md:58](invariants.md#slice-mutator-pattern)                    |
| Built-in templates / exercises (read-only, Clone instead of Edit)        | [invariants.md:73](invariants.md#built-in-entities)                        |
| First-run guard rules (`/setup` redirect)                                | [invariants.md:81](invariants.md#first-run-guard)                          |
| 5 MB localStorage cap + audio offload to IndexedDB                       | [invariants.md:89](invariants.md#storage-cap-and-audio-offload)            |
| ID generation (`newId()` / UUID)                                         | [invariants.md:95](invariants.md#id-generation)                            |
| AI calls via Worker proxy (`/api/transcribe`, `/api/generate`)           | [invariants.md](invariants.md#ai-calls-go-through-the-worker-proxy)        |
| Vault / at-rest encryption boundary (Repository layer)                   | [invariants.md](invariants.md#vault-and-at-rest-encryption)                |
| Recorder lifecycle (wake lock + visibility)                              | [invariants.md](invariants.md#recorder-lifecycle-wake-lock--visibility)    |
| Adding a domain field (4-step ripple)                                    | [invariants.md:111](invariants.md#type-changes-ripple)                     |
| Local-first transcription (background auto-pass for all providers)        | [invariants.md:189](invariants.md#local-first-transcription)               |
| Worker pool & device guards (pool size formula, ~40 MB per worker)       | [invariants.md:206](invariants.md#worker-pool-and-device-guards)           |
| Session status state machine (draft/recording/transcribing/generating/ready/finalized) | [workflows.md](workflows.md#session-status) |
| Clip status state machine (pending/ready/transcribing/transcribed/failed) | [workflows.md](workflows.md#sessionclip-status) |
| Recording workflow (start → WAL chunks → stop → save → auto-pass)        | [workflows.md](workflows.md#recording-flow)                                |
| Upload audio workflow (file → IDB → ready → auto-pass)                   | [workflows.md](workflows.md#upload-audio-flow)                             |
| Crash recovery (pending clips → WAL reassembly on next mount)             | [workflows.md](workflows.md#crash-recovery)                                |
| Auto-stop scenarios (hard cap, idle, mic disconnect, interrupted)         | [workflows.md](workflows.md#auto-stop-scenarios)                           |
| Note generation (guard → POST /api/generate → lazy note creation)        | [workflows.md](workflows.md#note-generation)                               |
| Finalization + post-finalization audit trail                              | [workflows.md](workflows.md#finalization)                                  |
| Session deletion (audio cleanup + demo-mode exception)                   | [workflows.md](workflows.md#session-deletion)                              |
| Demo mode completion (discharge + reset modal)                            | [workflows.md](workflows.md#demo-mode-completion)                          |
| Action guards (rate limits on transcribe + generate per session)          | [workflows.md](workflows.md#action-guards)                                 |
| Whisper live preview during recording (VAD segment recorder, T1 + display) | [workflows.md](workflows.md#whisper-live-preview-during-recording)        |
| Four-tier transcription (T1 Whisper VAD segments / T2 Local Whisper / T3 Nova / Edited) | [transcription.md](transcription.md#three-tier-model)            |
| Transcription write paths (T2 auto-pass, T3 Nova, Edited tier)            | [transcription.md](transcription.md#write-paths)                           |
| Transcription tier invariants (T2 never overwritten, T2/T3 clear editedTranscript) | [transcription.md](transcription.md#key-invariants)               |
| Revert actions (Revert to Draft vs Revert edits)                          | [transcription.md](transcription.md#revert-actions)                        |
| Admin page — tier coverage diagnostic (`/admin`, Terminal icon)           | [transcription.md](transcription.md#admin-page-admin)                      |
| Session page panel components (`sessions/` sub-dir)                      | [architecture.md:6](architecture.md#layering)                              |
| Inline confirmation pattern (no `window.confirm()`)                      | [invariants.md](invariants.md#destructive-actions-use-inline-confirmation) |
| PII scrubbing model — R2-only ONNX, interceptor always active (dev + prod) | [invariants.md](invariants.md#pii-scrubbing-model--r2-only-onnx-interceptor-always-active) |
| Boot sequence (load → migrate → safeParse → fallback)                    | [architecture.md:34](architecture.md#boot-sequence)                        |
| Units (ms timestamps, minutes, UUIDs, Markdown)                          | [architecture.md:48](architecture.md#units-and-coordinate-systems)         |
| Provider/mutator table (every hook + setters)                            | [architecture.md:58](architecture.md#provider-responsibilities)            |
| Storage keys (`ptnotes.appData` + IndexedDB `ptnotes-audio`)             | [architecture.md:84](architecture.md#storage-key-namespace)                |
| AI services (Cloudflare Whisper + Anthropic) and default models          | [architecture.md:93](architecture.md#ai-services)                          |
| Session status state machine                                             | [clinical-model.md:30](clinical-model.md#session-status-state-machine)     |
| Built-in templates and section structure                                 | [clinical-model.md:60](clinical-model.md#notetemplate)                     |
| AI prompt shape (`generateNote` user prompt)                             | [clinical-model.md:99](clinical-model.md#ai-prompt-shape)                  |
| Manual / no-AI fallback                                                  | [clinical-model.md:121](clinical-model.md#manual-fallback)                 |

## Project docs

### [docs/architecture.md](architecture.md)

Provider hierarchy, data flow, boot sequence, persistence (localStorage + IndexedDB), AI services, units. Read when wiring a new provider, debugging re-renders, or tracking down where a write happens.

| Section                   | Gist                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| Layering                  | One-way dependency direction (`pages → hooks → contexts → services`).                                    |
| Data flow                 | Mutation chain with 300ms debounce. Audio takes a parallel path through `AudioRepository`.               |
| Boot sequence             | `main.tsx` → `ErrorBoundary` → `AuthProvider` → `VaultGate` → `AppDataProvider` (load + migrate v15 + safeParse) → `IdleLockProvider` → first-run redirect. |
| Units & coordinates       | Dates = ms timestamps; durations = minutes; IDs = UUID; transcripts/notes = strings.                     |
| Provider responsibilities | Master table of every hook + every mutator.                                                              |
| Why slice providers       | Re-render scoping rationale.                                                                             |
| Storage key namespace     | `ptnotes.appData` (localStorage) + `ptnotes-audio` IDB store.                                            |
| AI services               | Cloudflare Workers AI / Deepgram Nova-3 (transcription) + Anthropic claude-sonnet-4-6 (generation); both Worker-proxied — browser never sees provider credentials. |
| Schema validation         | `safeParse` on load and on JSON import; never `parse` in render.                                         |

### [docs/invariants.md](invariants.md)

Non-obvious rules that fail silently if violated. **Read first before any cross-cutting edit.**

| Section                         | Gist                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Provider nesting order          | Exact stack; reordering slices among themselves is safe.                                                      |
| Single write path               | No component touches `localStorage` or IndexedDB directly.                                                    |
| Schema validation at boundaries | Zod runs on load/import only, not on every state update.                                                      |
| Slice mutator pattern           | `add` / `update` / `remove` / `set` semantics across list slices; `bulkUpdate` for atomic multi-slice writes. |
| Built-in entities               | Templates and exercises seeded with `builtin: true` are read-only at the provider level.                      |
| First-run guard                 | Redirect rule keyed on empty `clinician.name`; tolerate one frame of empty state.                             |
| Storage cap + audio offload     | 5 MB localStorage cap; audio Blobs go to IndexedDB via `AudioRepository`.                                     |
| ID generation                   | Always `newId()` (UUID); never timestamps/counters.                                                           |
| Worker-proxied AI               | All AI calls go through our Cloudflare Worker; gate code in `x-ptscribe-key` is obscurity, not auth.          |
| Vault and at-rest encryption    | Repository layer round-trips AppData + audio through AES-GCM; tab-lifetime DEK; no passphrase recovery.       |
| Recorder lifecycle              | `useRecorder` owns wake lock + `visibilitychange` listener; release on every exit path.                       |
| Local-first transcription       | Every clip (recorded or uploaded) is auto-transcribed locally via Whisper; cloud transcription is opt-in.     |
| Worker pool & device guards     | Parallel Whisper workers sized by CPU cores + device RAM; sequential fallback for constrained devices.        |
| Type changes ripple             | 4-step checklist: types + schema + default + migration.                                                       |
| Destructive action confirmation | Inline caution banner with `AlertTriangle`; never `window.confirm()`.                                         |

### [docs/style-guide.md](style-guide.md)

UI/UX style guide: dark navy frame + white card surface, cyan-teal accent, Inter typography, motion timing, component conventions (`.btn`, `.card`, inline confirmation, toast). Read before any visual change.

### [docs/personas.md](personas.md)

Two product personas — busy clinician (Dana) and PT business owner (Marcus) — with what they want, what kills their trust, and design implications. Read before proposing UX changes, defaults, or new settings.

### [docs/workflows.md](workflows.md)

State machines and step-by-step data flows for every major user journey. Read when adding a new flow, debugging unexpected session/clip status, or understanding what owns a particular side-effect.

| Section | Gist |
|---------|------|
| State machines | Session status, SessionClip status, Patient status — valid transitions and owners |
| Recording flow | `handleStartRecording` → WAL chunks → `handleFinishedRecording` → IDB save → T2 auto-pass |
| Upload audio flow | File → IDB → `ready` → same auto-pass path as recorded clips |
| Crash recovery | `useAudioRecovery`: pending clips on mount → WAL reassembly → `ready` or `failed` |
| Auto-stop scenarios | Hard cap, idle auto-stop, mic disconnect, recorder interrupted — all funnel through `handleFinishedRecording` |
| Note generation | Guard → `POST /api/generate` → `ensureNote` lazy creation → `status: 'ready'` |
| Finalization | `handleFinalize` required-section guard → `finalizeNote` → `status: 'finalized'`; audit trail on re-edit |
| Session deletion | Audio IDB cleanup + note removal; demo-mode exception resets instead of deletes |
| Demo mode completion | Discharge patient → DemoCompleteModal → start fresh or keep |
| Action guards | Rate limits on cloud transcription + generation per session |
| Whisper live preview | VAD segment recorder writes T1 transcript + drives display bubbles during recording |

### [docs/transcription.md](transcription.md)

Four-tier transcription system: Web Speech / Whisper VAD (T1), local Whisper auto-pass (T2), Nova cloud (T3), Edited (manual edit or PII scrub). Read when touching any transcription write path, the tier field definitions, revert actions, or the Admin page.

| Section | Gist |
|---------|------|
| Four-tier model | Tier table: source, timing, quality, network requirement; Web Speech as opt-in T1 alternative |
| Data fields | Every `Session` and `SessionClip` field per tier with writer ownership |
| Write paths | Exact code flow for T2 auto-pass, T3 Nova pass, and Edited tier (manual edit + PII scrub) |
| Key invariants | T2 never overwritten by T3; T2/T3 writes clear `editedTranscript`; auto-pass always runs |
| Revert actions | Two revert buttons: "Revert to Draft" (T2) and "Revert edits" (clear `editedTranscript`) |
| Schema version | v18 (four-tier fields), v19 (webSpeechEnabled gate); legacy session fallback |
| Admin page | `/admin` diagnostic: coverage stats + per-session tier viewer |

### [docs/clinical-model.md](clinical-model.md)

Domain entities (Patient, Session, Note, Template, Exercise, PlanOfCare), session state machine, AI prompt shape, manual-only fallback. Read when adding a new domain field, changing the note generation prompt, or wiring a new template format.

| Section                      | Gist                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Patient                      | Demographics + `mrn` (never sent to AI) + `status` filter.                                        |
| Session                      | Encounter; owns audio + transcript + (eventually) note.                                           |
| Session status state machine | `draft → recording → transcribing → generating → ready → finalized`.                              |
| Note                         | Structured `{ key, label, body }[]` sections; `finalized` locks the editor.                       |
| NoteTemplate                 | Built-ins (SOAP/Eval/Progress/Discharge) seeded; custom templates editable.                       |
| Exercise                     | Region + category + dosage; built-in library covers common PT exercises.                          |
| PlanOfCare                   | Per-patient goals + prescriptions; one active plan per patient.                                   |
| AI prompt shape              | User prompt = patient context + section list + transcript; system prompt comes from the template. |
| Manual fallback              | Every AI step is optional — the app is usable fully offline.                                      |

## Spec

### [docs/superpowers/specs/](superpowers/specs/)

Original design specs. Read when a plan is ambiguous or when validating that a feature aligns with original intent.
