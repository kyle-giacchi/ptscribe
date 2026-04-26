# Docs Index

Section-anchored map of every doc. Read with `Read tool offset:LINE limit:N` or open the link to jump straight to the section. Update when sections move.

## Quick lookup — "Where is X?"

| Topic                                                                    | File:Line                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Provider nesting order                                                   | [invariants.md:5](invariants.md#provider-nesting-order)                     |
| Single write path (component → slice → AppDataProvider → DataRepository) | [invariants.md:25](invariants.md#single-write-path)                         |
| Schema validation rule (`safeParse` only on load/import)                 | [invariants.md:48](invariants.md#schema-validation-at-boundaries)           |
| Slice mutator pattern (`add` / `update` / `remove` / `set`)              | [invariants.md:58](invariants.md#slice-mutator-pattern)                     |
| Built-in templates / exercises (read-only, Clone instead of Edit)        | [invariants.md:73](invariants.md#built-in-entities)                         |
| First-run guard rules (`/setup` redirect)                                | [invariants.md:81](invariants.md#first-run-guard)                           |
| 5 MB localStorage cap + audio offload to IndexedDB                       | [invariants.md:89](invariants.md#storage-cap-and-audio-offload)             |
| ID generation (`newId()` / UUID)                                         | [invariants.md:95](invariants.md#id-generation)                             |
| AI calls via Worker proxy (`/api/transcribe`, `/api/generate`)           | [invariants.md](invariants.md#ai-calls-go-through-the-worker-proxy)         |
| Vault / at-rest encryption boundary (Repository layer)                   | [invariants.md](invariants.md#vault-and-at-rest-encryption)                 |
| Recorder lifecycle (wake lock + visibility)                              | [invariants.md](invariants.md#recorder-lifecycle-wake-lock--visibility)     |
| Adding a domain field (4-step ripple)                                    | [invariants.md:111](invariants.md#type-changes-ripple)                      |
| Boot sequence (load → migrate → safeParse → fallback)                    | [architecture.md:34](architecture.md#boot-sequence)                         |
| Units (ms timestamps, minutes, UUIDs, Markdown)                          | [architecture.md:48](architecture.md#units-and-coordinate-systems)          |
| Provider/mutator table (every hook + setters)                            | [architecture.md:58](architecture.md#provider-responsibilities)             |
| Storage keys (`ptnotes.appData` + IndexedDB `ptnotes-audio`)             | [architecture.md:84](architecture.md#storage-key-namespace)                 |
| AI services (Cloudflare Whisper + Anthropic) and default models          | [architecture.md:93](architecture.md#ai-services)                           |
| Session status state machine                                             | [clinical-model.md:30](clinical-model.md#session-status-state-machine)      |
| Built-in templates and section structure                                 | [clinical-model.md:60](clinical-model.md#notetemplate)                      |
| AI prompt shape (`generateNote` user prompt)                             | [clinical-model.md:99](clinical-model.md#ai-prompt-shape)                   |
| Manual / no-AI fallback                                                  | [clinical-model.md:121](clinical-model.md#manual-fallback)                  |

## Project docs

### [docs/architecture.md](architecture.md)

Provider hierarchy, data flow, boot sequence, persistence (localStorage + IndexedDB), AI services, units. Read when wiring a new provider, debugging re-renders, or tracking down where a write happens.

| Section                   | Gist                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Layering                  | One-way dependency direction (`pages → hooks → contexts → services`).                     |
| Data flow                 | Mutation chain with 300ms debounce. Audio takes a parallel path through `AudioRepository`.|
| Boot sequence             | `main.tsx` → `App.tsx` → load + migrate + safeParse → first-run redirect.                 |
| Units & coordinates       | Dates = ms timestamps; durations = minutes; IDs = UUID; transcripts/notes = strings.      |
| Provider responsibilities | Master table of every hook + every mutator.                                               |
| Why slice providers       | Re-render scoping rationale.                                                              |
| Storage key namespace     | `ptnotes.appData` (localStorage) + `ptnotes-audio` IDB store.                             |
| AI services               | Cloudflare Workers AI Whisper (transcription) + Anthropic (generation), browser-direct, BYO credentials. |
| Schema validation         | `safeParse` on load and on JSON import; never `parse` in render.                          |

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
| Worker-proxied AI              | All AI calls go through our Cloudflare Worker; gate code in `x-ptscribe-key` is obscurity, not auth.          |
| Vault and at-rest encryption    | Repository layer round-trips AppData + audio through AES-GCM; tab-lifetime DEK; no passphrase recovery.       |
| Recorder lifecycle              | `useRecorder` owns wake lock + `visibilitychange` listener; release on every exit path.                       |
| Type changes ripple             | 4-step checklist: types + schema + default + migration.                                                       |

### [docs/style-guide.md](style-guide.md)

UI/UX style guide: soft gray-blue ground + soft orange accent, motion timing scale, typography pairing (Fraunces + Manrope), component conventions. Read before any visual change.

### [docs/clinical-model.md](clinical-model.md)

Domain entities (Patient, Session, Note, Template, Exercise, PlanOfCare), session state machine, AI prompt shape, manual-only fallback. Read when adding a new domain field, changing the note generation prompt, or wiring a new template format.

| Section                         | Gist                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Patient                         | Demographics + `mrn` (never sent to AI) + `status` filter.                                          |
| Session                         | Encounter; owns audio + transcript + (eventually) note.                                             |
| Session status state machine    | `draft → recording → transcribing → generating → ready → finalized`.                                |
| Note                            | Structured `{ key, label, body }[]` sections; `finalized` locks the editor.                         |
| NoteTemplate                    | Built-ins (SOAP/Eval/Progress/Discharge) seeded; custom templates editable.                         |
| Exercise                        | Region + category + dosage; built-in library covers common PT exercises.                            |
| PlanOfCare                      | Per-patient goals + prescriptions; one active plan per patient.                                     |
| AI prompt shape                 | User prompt = patient context + section list + transcript; system prompt comes from the template.   |
| Manual fallback                 | Every AI step is optional — the app is usable fully offline.                                        |

## Spec

### [docs/superpowers/specs/](superpowers/specs/)

Original design specs. Read when a plan is ambiguous or when validating that a feature aligns with original intent.
