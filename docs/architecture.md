# Architecture

## Layering

```
src/
  services/       DataRepository (localStorage), AudioRepository (IndexedDB),
                  ai/transcribe.ts (Cloudflare Whisper), ai/generate.ts (Anthropic),
                  ai/client/localWhisper.ts (client-side Whisper via worker pool)
  contexts/       AppDataProvider (root) + slice providers (one per domain)
  hooks/          useRecorder, useLiveTranscript, useRecordingFlow, 
                  useTranscriptionFlow, useGenerationFlow,
                  useBelowBreakpoint (window-width matcher), useDismissable (Esc + click-outside)
  pages/          Route-level components — consume hooks/contexts only
  components/     common/ — AppShell, GlobalTopNav, PatientQuickSearch, TopNavControls (AlertsButton/
                            VaultPill/ProfileButton — exported for GlobalTopNav reuse),
                            Sidebar (scoped to /today only), AudioFileInput, ErrorBanner,
                            ConfirmBanner, Modal, Field, PageHeader
                  sessions/ — Session page panels:
                    SessionTopBar (chrome row: back-to-chart, breadcrumb, AddClipButton,
                      Audio clips toggle, Sign & export),
                    AddClipButton, ClipsDrawer (right drawer ≥768px / bottom sheet <768px),
                    RecordingPanel, TranscriptPanel (seekSignal prop drives clip timestamp scroll),
                    PIIScrubModal (owned usePrivacyFilter; lazy scan + inline diff),
                    NoteToolbar (Template, Modifier, Copy, Generate/Regenerate), NotePanel,
                    plus small extracts: RecordWarningBanner, ReviewEmptyState,
                    TranscriptCollapsedTab, ResetSessionModal, UploadProcessingView
  types/          Domain types (index.ts)
  schemas/        Zod schemas mirroring types + defaultAppData factory
  utils/          ids.ts, migrations.ts, downloadFile.ts, markdown.ts
  lib/            safeStorage.ts, storageKeys.ts, utils.ts, audio/ (VAD, merge, whisper worker)
```

Dependencies flow one way: `pages/components` -> `hooks` -> `contexts` -> `services`. Nothing in `services/` imports from `contexts/` or higher.

## Shell and navigation

`AppShell` is intentionally thin: `OfflineIndicator` + `GlobalTopNav` + optional demo banner + the routed `<Outlet/>` + `<Toaster/>`. It does **not** render a sidebar, page title, or per-page chrome — those belong to the page.

| Layer | Component | Notes |
|---|---|---|
| App chrome (every route) | `GlobalTopNav` (52 px) | Hamburger overflow menu, brand, primary nav (My Chart, Review queue, Patients, Templates, Settings), `PatientQuickSearch` patient typeahead, `VaultPill`, `AlertsButton`, `ProfileButton`. Hamburger surfaces below 1024 px and the horizontal nav becomes the overflow menu. |
| Dashboard rail | `Sidebar` | Rendered only by `pages/Dashboard.tsx` as a left rail. Hidden below `md` (768 px) and re-surfaced as a drawer behind a hamburger button at the page top. |
| Session chrome | `SessionTopBar` (56 px) | Back-to-chart link, patient + session breadcrumb, status badge, `AddClipButton`, Audio clips toggle (controls `ClipsDrawer`), Sign & export / Unlock. |
| Session content | `RecordingPanel` or `NotePanel` + `TranscriptPanel` + `ClipsDrawer` | Two tabs only: `record` and `review`. The legacy `clips` tab is gone — clips live in the inspector drawer. |

`PatientQuickSearch` listens for ⌘/Ctrl-K to focus the input; results are patient matches (name or primary diagnosis), keyboard-navigable, navigate to `/patients/:id` on enter.

`GlobalTopNav`'s overflow menu and `AddClipButton`'s dropdown both close on Escape and outside-click via the shared `useDismissable` hook. Width-conditional layouts (hamburger surface, transcript auto-collapse, ClipsDrawer bottom-sheet vs side drawer) use `useBelowBreakpoint(maxWidthPx)`. See [style-guide.md — Responsive defaults](style-guide.md#responsive-defaults) for the breakpoint table.

## Data flow

```
User action (click / form submit)
  -> component calls slice mutator (e.g. addPatient(p))
    -> PatientsProvider calls updatePatientsSlice(next)
      -> AppDataProvider merges slice into AppData, stamps lastModified
        -> scheduleSave fires after 300 ms debounce
          -> DataRepository.save(appData)
            -> safeLocalStorage.setItem('ptnotes.appData', json)
```

The debounce collapses rapid successive mutations (e.g. typing in a form field) into a single write. On unmount, `AppDataProvider` cancels any pending timer — the last explicit save before unmount is the final state on disk.

Audio Blobs follow a parallel path through `AudioRepository` to IndexedDB; only the `audioRef` (= sessionId) lives in `AppData`.

## Boot sequence

1. `main.tsx` renders `<App />` inside `<StrictMode>`.
2. `App.tsx` wraps everything in `<ErrorBoundary>` — any uncaught render error shows a "reload" screen rather than a blank page.
3. `AuthProvider` (BetterAuth) resolves the session. Public routes (`/home`, `/login`, `/auth/callback`) render outside the app provider tree.
4. `VaultGate` checks for an existing vault. If one exists but is locked it shows the passphrase prompt; if none exists it renders children immediately.
5. `AppDataProvider` calls `dataRepository.load()` synchronously in the `useState` initializer.
   - `DataRepository.load()` reads `safeLocalStorage.getItem('ptnotes.appData')`.
   - Runs `migrate(parsed)` to bring old versions up to current (currently v15).
   - Runs `AppDataSchema.safeParse(migrated)`. On failure, logs and returns `null`.
   - `AppDataProvider` falls back to `defaultAppData()` when `load()` returns `null`. The default seeds built-in templates (SOAP, Evaluation, Progress, Discharge) and the built-in exercise library.
   - For authenticated non-demo users, calls `navigator.storage.persist()` to request durable storage.
6. Slice providers read their slice from `appData` via `useAppData()`.
7. `IdleLockProvider` arms a timer (duration from `settings.security.idleLockMinutes`) that calls `vault.lock()` on idle.
8. `FirstRunGuard` fires a `useEffect` after first render. If `clinician.name` is empty and path is not `/setup`, it redirects to `/setup`.
9. The Setup wizard collects the clinician's name + credentials (and optional AI keys) and navigates to `/today`.

## Units and coordinate systems

| Domain                 | Unit                      | Notes                                                                                           |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| Dates                  | **ms timestamp (number)** | `Patient.dob`, `Session.date`, `Note.finalizedAt`, `createdAt`/`updatedAt` are `Date.now()` ms. |
| Durations              | **minutes (number)**      | `Session.durationMin`. Recorder elapsed UI converts ms → mm:ss for display only.                |
| IDs                    | **UUID v4 string**        | Generated by `newId()` in `src/utils/ids.ts`. Never timestamps.                                 |
| Audio                  | **Blob in IndexedDB**     | Keyed by `sessionId`. `Session.audioRef = sessionId` is the only AppData reference.             |
| Transcript / note body | **string (Markdown)**     | Note sections are plain text; export uses Markdown for downloads.                               |

## Provider responsibilities

| Provider            | Hook             | Mutators                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppDataProvider`   | `useAppData()`   | `updateClinicianSlice`, `updatePatientsSlice`, `updateSessionsSlice`, `updateNotesSlice`, `updateTemplatesSlice`, `updateExercisesSlice`, `updatePlansSlice`, `updateSettingsSlice`, `bulkUpdate`, `resetAll`. Slice updaters accept either a value or `(prev) => next`; returning the same reference short-circuits and skips a save. |
| `ClinicianProvider` | `useClinician()` | `updateClinician(patch)`, `setClinician(next)`                                                                                                                                                                                                                                                                                         |
| `PatientsProvider`  | `usePatients()`  | `addPatient`, `updatePatient`, `removePatient`, `setPatients`                                                                                                                                                                                                                                                                          |
| `SessionsProvider`  | `useSessions()`  | `addSession`, `updateSession`, `removeSession`, `setSessions`                                                                                                                                                                                                                                                                          |
| `NotesProvider`     | `useNotes()`     | `addNote`, `updateNote`, `removeNote`, `setNotes`, `finalizeNote(id)`                                                                                                                                                                                                                                                                  |
| `TemplatesProvider` | `useTemplates()` | `addTemplate`, `updateTemplate` (no-op for builtins), `removeTemplate` (no-op for builtins), `cloneTemplate(id)`                                                                                                                                                                                                                       |
| `ExercisesProvider` | `useExercises()` | `addExercise`, `updateExercise` (no-op for builtins), `removeExercise` (no-op for builtins)                                                                                                                                                                                                                                            |
| `PlansProvider`     | `usePlans()`     | `addPlan`, `updatePlan`, `removePlan`, `setPlans`                                                                                                                                                                                                                                                                                      |
| `SettingsProvider`  | `useSettings()`  | `updateSettings`, `updateAi`, `updateAudio`, `updateUi`, `updateSession`, `updateRecordingLimits`, `updateOrgPolicy`, `updateFirstRun`, `setIdleLockMinutes`, `setAutoDeleteAudioAfterDays`, `getPageMode` / `setPageMode` (per-page detail level; persisted directly to `localStorage`, not in `AppData`).                            |
| `IdleLockProvider`  | —                | No mutators. Reads `settings.security.idleLockMinutes`; calls `vault.lock()` after that many minutes of inactivity. Must be inside `SettingsProvider`.                                                                                                                                                                                  |
| `AuthProvider`      | `useAuth()`      | Wraps BetterAuth (passkey + magic link, served via Worker at `/api/auth`). Sits at router level, outside the app provider tree. Exposes `isAuthenticated`, `user`, `signOut`.                                                                                                                                                           |
| `ConfigSyncProvider` | —               | Mounted inside `AppDataProvider`. Pulls non-clinical config from D1 on login and debounce-pushes on change via slice mutators. No mutators of its own. **Zero `/api/config/*` requests for demo/test-user/unauthenticated sessions** (isolation gate). See [Cross-device config sync](#cross-device-config-sync-d1).                       |
| `OrgConfigProvider` | `useOrgConfig()` | Read-only org policy + shared template/exercise library (`policy`, `sharedTemplates`, `sharedExercises`, `canManage`, `updateOrgConfig`). Loads only when `currentUser.orgId` is set; demo/no-org isolated. Shared library is never written into AppData.                                                                                |

## Session flow hooks

`Session.tsx` drives the visit through one orchestrator hook, `useSessionMachine`, which owns the session reducer (`sessionMachineReducer`) and composes the phase hooks below, re-exposing their handlers to the page:

| Hook                     | Owns                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSessionMachine`      | Top-level orchestrator. Reducer-backed session state; composes the phase hooks and surfaces their handlers/flags to `Session.tsx`.                                 |
| `useCapturePhase`        | Recording + upload lifecycle: `handleStartRecording`, `handleFinishedRecording`, `handleUploadAudio`. Wires `useRecorder` (WAL chunking, wake lock, VAD T1 segment recorder) to clip/session mutations. |
| `useTranscriptSource`    | Transcript-tier resolution: `backgroundT2` (auto local-Whisper pass via `useBackgroundTranscription`), `runT3` (explicit Nova "Improve with AI", capped 1×/session), `revertToLocal`. |
| `useGeneratePhase`       | AI note generation loop + `finalize`/`unfinalize` + section edits, wired to NoteToolbar/NotePanel.                                                                 |
| `useActionGuard`         | Anti-double-tap **cooldown only** (`checkActionGuard`, `recordAction`). Lifetime per-session caps are not tracked here — they persist on the Session (`cloudTranscribeCount`, `generateCount`) so they survive reload/Revert/Unlock. |

`AppDataProvider` owns persistence. Slice providers are thin wrappers that give domain-scoped mutators; they read from `appData` and delegate writes back up via `updateXSlice`.

## Why slice providers

Each slice provider creates its own React context. A component that only uses `usePatients()` subscribes only to the `patients` slice. When `notes` changes, `PatientsProvider`'s context value does not change, so patient consumers do not re-render.

Without this split, every consumer of a single global context would re-render on any mutation anywhere in the app. The slice model keeps re-renders scoped to the relevant domain.

## Storage key namespace

| Store                       | Key / name                                      | Contents                                                            |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `localStorage`              | `ptnotes.appData`                               | Full `AppData` JSON blob (≤ 5 MB)                                   |
| `localStorage`              | `ptnotes.vault`                                 | Wrapped DEK + KDF params; tab-scoped key only                       |
| IndexedDB (`ptnotes-audio`) | object store `recordings`, key = `clipId`       | Final consolidated audio Blob per clip (written on recorder stop)   |
| IndexedDB (`ptnotes-audio`) | object store `recording_chunks`, key = `clipId` | Per-chunk write-ahead log during recording; cleared after clip save |
| `localStorage`              | `ptscribe-config-sync:<userId>`                 | Per-user config-sync record `{ hash, localUpdatedAt, serverUpdatedAt }` — LWW version for D1 sync; **not** in `AppData`. Plaintext (no clinical data). |

Defined in `src/lib/storageKeys.ts`.

When the vault is unlocked, every value in `ptnotes.appData` and the `recordings`/`recording_chunks` IndexedDB stores is round-tripped through AES-GCM via `src/lib/vault/`. The recorder also owns a `'screen'` wake lock and a `visibilitychange` listener for the duration of a clip; both are released on `stop`/`reset`/unmount. Wake lock is best-effort and never blocks recording.

## AI services

### Local-first transcription pipeline

**Every audio clip is auto-transcribed locally first, regardless of the user's configured transcription provider.**

Pipeline (from `src/hooks/useBackgroundTranscription.ts`):

1. `blobToFloat32(blob)` — decode audio blob to 16 kHz mono Float32Array via Web Audio API
2. `findSpeechRangesML(samples)` — Silero ML VAD extracts speech ranges (non-fatal; falls back to full audio on error)
3. `extractRanges(samples, ranges)` — strip silence between speech ranges
4. Fixed 2-minute chunking of the speech-only audio (`LOCAL_CHUNK_SEC = 120`; each chunk maps to a real audio timestamp)
5. `transcribeFloat32Parallel(chunks, model, onProgress)` — dispatch chunks across a device-capability-sized worker pool

This fires as a background auto-transcription effect (`useBackgroundTranscription`) for every clip that reaches `status: 'ready'` with no `t2Transcript`. Result is stored in both `t2Transcript` and `transcript` so the Review tab populates without user action.

Cloud transcription (Deepgram Nova-3 via Cloudflare Worker) is a **separate, explicit user action** accessed from TranscriptPanel that upgrades the local result. See [invariants.md#local-first-transcription](invariants.md#local-first-transcription) and [invariants.md#worker-pool-and-device-guards](invariants.md#worker-pool-and-device-guards).

### Worker proxy for cloud services

AI calls flow `browser → our Cloudflare Worker → provider`. Provider credentials are server-side secrets (Worker `env`); the browser never sees them. Each request carries the `AppGate` 6-digit code in the `x-ptscribe-key` header — a friction layer, not authentication.

| Browser endpoint       | Worker action                                      | Provider              | Default model                               |
| ---------------------- | -------------------------------------------------- | --------------------- | ------------------------------------------- |
| `POST /api/transcribe` | Forwards raw audio bytes to the Workers AI binding | Cloudflare Workers AI | `@cf/deepgram/nova-3` (speaker diarization) |
| `POST /api/generate`   | Forwards JSON to the Anthropic Messages API        | Anthropic Messages    | `claude-sonnet-4-6`                         |

Wire details:

- `/api/transcribe` accepts `Content-Type: application/octet-stream` (raw bytes, no base64). Optional `x-ptscribe-model` and `x-ptscribe-language` headers override defaults. Response is `{ text: string }`. Client retries up to 3 times on network errors or 408/425/429/5xx with delays of 500 ms → 1.5 s → 4 s.
- `/api/generate` accepts a JSON body forwarded near-verbatim to Anthropic. The Worker injects the API key, `anthropic-version`, and the per-tone-style system-prompt block. Client retries up to 2 times on 429/5xx with delays of 1 s → 3 s.
- Prompt caching: `callAnthropic` sends `cacheSystem: true` by default — the Worker marks the system prompt with `cache_control: ephemeral` so Anthropic caches it across calls that share the same template.
- Local development: `vite.config.ts` proxies `/api/*` → `http://localhost:8787` (the wrangler dev server). `npm run dev` and `wrangler dev` run side by side.
- Provider value `'none'` short-circuits cloud calls so the workflow stays manual (local Whisper still runs, Web Speech for live transcript, hand-edited notes).

The Worker source lives at `worker/index.ts`; secrets are managed via `wrangler secret put` and surfaced as `env.PTSCRIBE_GATE`, `env.ANTHROPIC_API_KEY`, etc. The Workers AI binding (`env.AI`) handles Nova-3 without an explicit token.

**Defense in depth (all server-side, in `worker/index.ts`):**

- **Origin enforcement** — a *missing* `Origin` header is denied (browsers always send one on `fetch`, so no-Origin implies a script/curl).
- **Obscurity gate** — `x-ptscribe-key` must equal `sha256(PTSCRIBE_GATE)`, compared in constant time. This is friction, not auth; the real protection is the rate limits below.
- **Rate limits (KV `env.RATE_LIMIT`)** — pre-gate 20/min/IP, then 10/min and 300/day per IP, plus a 500/day global ceiling (`RATE_LIMIT_PRE_GATE_PER_MIN` / `_PER_MIN` / `_PER_DAY` / `_GLOBAL_PER_DAY`). KV read→increment→write is non-atomic by design (a small over-count at the boundary is acceptable).
- **Model allowlists** — `ALLOWED_GENERATE_MODELS` and the transcription allowlist reject any model ID before it reaches a provider.
- **CSP is the local-first boundary** — `connect-src 'self' https://huggingface.co`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`. A single compromised dependency cannot exfiltrate to an attacker server. The model proxy (`/api/model/*`) is allowlisted to specific HuggingFace repos (`ALLOWED_MODEL_REPOS`) so it can't be abused as an open proxy.

**What the AI is allowed to see (the generation bound):** note generation sends only the curated transcript + chosen template + visit type + a small patient-context block (name, derived age, `primaryDiagnosis`). **MRN, ICD-10, prior notes, plan of care, and prior sessions are never injected.** PII scrubbing happens on-device and is clinician-triggered. See [workflows.md — AI prompt shape](workflows.md#ai-prompt-shape) for the exact prompt and the full bound.

### What runs where (local-first map)

What runs on-device vs. over the network determines what is *instant* vs. a *wait* — the single most important fact for pacing any new UI.

| Capability | Where | Network? | UX character |
|---|---|---|---|
| Data read/write + encryption | Browser (Repository + vault) | No | Instant |
| Audio recording, silence-trim, VAD | Browser (Web Audio + Silero ML VAD) | No | Instant / background |
| **T2 local Whisper** (canonical transcript) | Browser Web Worker pool | No (model fetched once, then IDB-cached) | **Async wait** (seconds–minutes) |
| PII scrub (NER) | Browser Web Worker | No | Short wait, on demand |
| Audio playback | Browser (Blob from IndexedDB) | No | Instant |
| T1 live preview | Worker → Cloudflare Whisper *(or browser Web Speech)* | Yes | Streams during recording |
| T3 Nova ("Improve with AI") | Worker → Deepgram | Yes | Async wait, **capped 1×/session** |
| Note generation | Worker → Anthropic | Yes | Async wait, atomic result |

The app is usable **fully offline** except the three explicitly-networked actions (T1 live, T3 Nova, note generation). Design loading/empty states around the two real waits — the **T2 auto-pass** (between Capture and Curate) and **Generate** — not around generic "fetching data" spinners.

### AI model catalog

| Model | Provider | Where it runs | Purpose |
|---|---|---|---|
| `@cf/deepgram/nova-3` | Cloudflare Workers AI | Cloudflare edge | Cloud transcription with speaker diarization (default; Whisper variants `@cf/openai/whisper`, `@cf/openai/whisper-large-v3-turbo` also allowlisted) |
| `Xenova/whisper-tiny.en` | HuggingFace / Transformers.js | Browser Web Worker | Local (on-device) transcription (~40 MB ONNX; default `model.onnx`, no `dtype` needed) |
| `Xenova/bert-base-NER` (INT8) | HuggingFace / Transformers.js | Browser Web Worker | On-device PII scrubbing, default (`dtype: 'q8'` → `onnx/model_quantized.onnx`, ~90 MB) |
| `openai/privacy-filter` (Q4) | HuggingFace / Transformers.js | Browser Web Worker | On-device PII scrubbing, backup via `settings.session.piiModel` (`dtype: 'q4'`, ~875 MB; practical only after IDB cache) |
| `claude-sonnet-4-6` | Anthropic | Cloudflare Worker proxy | Structured note generation |

**Model file delivery + caching** — browser worker fetch interceptor checks IndexedDB (`ptscribe-model-cache`) first; on miss it requests `/api/model/{org}/{model}/resolve/main/{file}`. The Worker (`handleModelFile`) serves from the R2 bucket `ptnotes-models` if present, else proxies from HuggingFace and writes back to R2 (fire-and-forget). R2 keys mirror the HuggingFace URL path so the interceptor can derive them directly. The app works without seeding (first user per file pays the HuggingFace cold-download); pre-seed with `npx tsx scripts/seed-r2-models.ts` (Whisper) and `python scripts/convert-privacy-filter.py` (privacy filter). Verify with `wrangler r2 object list ptnotes-models --prefix "<org>/<model>"`.

## Cross-device config sync (D1)

Registered (non-demo) users persist their **non-clinical** config to Cloudflare D1 so it follows them across devices; orgs carry a policy blob + a shared template/exercise library. **Clinical data and audio never leave the device** — see [invariants.md — D1 config sync](invariants.md#d1-config-sync--clinical-exclusion-has-exactly-one-chokepoint) for the hard boundary and the demo/auth isolation gate.

What syncs:

| Data | Source | Synced? | D1 table |
| --- | --- | --- | --- |
| `settings` subtree | AppData | ✅ | `user_config` |
| `clinician` profile | AppData | ✅ | `user_config` |
| custom (`builtin:false`) templates/exercises | AppData | ✅ | `user_config` |
| built-in templates/exercises | regenerated locally | ❌ never sent | — |
| `patients`/`sessions`/`notes`/`plans`, audio | AppData / IndexedDB | ❌ **never** | — |
| org profile / policy / shared library | D1 | ✅ | `org_config` |

Data flow (client side):

```
ConfigSyncProvider (mounted inside AppDataProvider)
  on login   -> GET /api/config/user -> reconcile(local, server) -> apply | push | noop
  on change  -> projectUserConfig(appData)  [SINGLE clinical-exclusion point]
                -> hash; if changed, debounce ~1.5s -> PUT /api/config/user
  apply       -> write server config back through slice mutators
                 (updateSettingsSlice / updateClinicianSlice /
                  updateTemplatesSlice / updateExercisesSlice) — single write path,
                  one full-replacement write per slice (no add→update chaining)
```

Reconciliation is **blob-level last-write-wins**. The config version (`updatedAt`) lives in a per-user `localStorage` record `ptscribe-config-sync:<userId>`, separate from `AppData.lastModified` (which bumps on patient edits that must not sync). The worker PUT rejects a stale write with `STALE_WRITE` 409.

`OrgConfigProvider` loads `GET /api/config/org` when `currentUser.orgId` is set and exposes `{ policy, sharedTemplates, sharedExercises, canManage, updateOrgConfig() }`. Org templates/exercises stay **in this context, read-only** — they are merged in-place at the consumption surfaces (Templates, Exercises, NewSession, Session) and never written into AppData.

Worker side: `worker/config.ts` handles `GET/PUT /api/config/{user,org}` (org PUT behind `requireManager`); `worker/configLogic.ts` holds the pure validation (size cap, forbidden-key scan, LWW, builtin stripping). The route is session-authenticated like `/api/org/*` — **no `x-ptscribe-key` gate**. Shared worker plumbing (`worker/db.ts` `makeDb`, `worker/caller.ts` `resolveCaller`/`requireManager`/`getSessionUserId`) is reused across org and config routes.

## Schema validation

`AppDataSchema` in `src/schemas/index.ts` is a Zod object schema that mirrors every field in `AppData`. It is the single source of truth for what a valid persisted state looks like. `DataRepository.load()` calls `AppDataSchema.safeParse` — never `parse` (which throws). On failure it returns `null` and lets `AppDataProvider` reset to defaults rather than crashing.

JSON imports from the Settings page must follow the same pattern: validate with `AppDataSchema.safeParse` before merging into state via `bulkUpdate`.
