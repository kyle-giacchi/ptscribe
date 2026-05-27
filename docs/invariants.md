# Invariants

Non-obvious rules that break things silently if violated. Read before editing any cross-cutting concern.

## Provider nesting order

`App.tsx` wraps providers in this exact order (outermost first):

```
ErrorBoundary                    <- catches any uncaught render error
  BrowserRouter
    AuthProvider                 <- BetterAuth session (passkey + magic link)
      Routes
        AppGate?                 <- gate code prompt in demo mode only
          VaultGate              <- passphrase prompt; gates AppDataProvider
            AppDataProvider      <- owns localStorage read/write
              ClinicianProvider
                PatientsProvider
                  SessionsProvider
                    NotesProvider
                      TemplatesProvider
                        ExercisesProvider
                          PlansProvider
                            SettingsProvider
                              DemoBootstrap    <- seeds demo data if needed
                                FirstRunGuard
                                  Routes (app routes)
```

All slice providers call `useAppData()` internally — they must be nested inside `AppDataProvider`. Reordering slice providers among themselves is safe. Moving any slice provider outside `AppDataProvider` will throw at runtime.

`VaultGate` must wrap `AppDataProvider` — it gates access until the vault is unlocked (or no vault is configured). `AppGate` only appears in demo mode and sits outside `VaultGate`.

Vault lifetime is **tab-lifetime only**. Tab close evicts the in-memory DEK; the next mount requires the passphrase again. There is no idle-timeout relock — by design, a clinician mid-visit is never interrupted by a vault prompt. (See [Vault and at-rest encryption](#vault-and-at-rest-encryption).)

`FirstRunGuard` calls `useClinician()` so it must stay inside `ClinicianProvider`. Its current innermost position (just before `<Routes>`) is intentional.

## Single write path

Components **never** call `localStorage` or IndexedDB directly.

Correct flow for AppData:

```
component event
  -> slice provider mutator (e.g. addPatient, finalizeNote)
    -> AppDataProvider.updateXSlice(next)
      -> setAppData + scheduleSave (300 ms debounce)
        -> DataRepository.save(next)
          -> safeLocalStorage.setItem('ptnotes.appData', json)
```

Correct flow for audio Blobs (too large for localStorage):

```
component event (recorder stop)
  -> audioRepository.save(sessionId, blob)
    -> IndexedDB ptnotes-audio / recordings store
  -> slice mutator stamps session.audioRef = sessionId
```

Bypassing any step in the AppData chain — especially writing to `localStorage` from a component or hook — breaks the debounce, skips `lastModified` stamping, and creates two sources of truth.

**Session mutations go through `useSessionPatcher`.** The hook provides three stable, memoized callbacks (`patchSession`, `patchClips`, `patchClip`) that automatically scope writes to the current `sessionId` and stamp `updatedAt: Date.now()` on every mutation. Calling `updateSessionsSlice` directly from a hook or component skips the timestamp stamping and scatters the scoping logic. Always use `useSessionPatcher` for session and clip writes.

## Schema validation at boundaries

`DataRepository.load()` runs `AppDataSchema.safeParse` on the raw JSON. On parse failure it logs and returns `null`; `AppDataProvider` falls back to `defaultAppData()`.

- **Load boundary**: `DataRepository.load()` — always validated.
- **Import boundary**: any import from a backup file must go through the same `AppDataSchema.safeParse` path before touching state. `Settings` page does this before calling `bulkUpdate`.
- **In-memory mutations**: skip validation. Zod is called only at I/O boundaries.

Do not call `AppDataSchema.parse` inside render loops or on every state update — it is expensive and unnecessary.

## Slice mutator pattern

Every list-shaped slice provider (`PatientsProvider`, `SessionsProvider`, `NotesProvider`, `TemplatesProvider`, `ExercisesProvider`, `PlansProvider`) exposes the same shape:

| Method               | Behavior                                      |
| -------------------- | --------------------------------------------- |
| `addX(entity)`       | Appends to the array                          |
| `updateX(id, patch)` | Shallow-merges `patch` into the matching item |
| `removeX(id)`        | Filters out the matching item                 |
| `setX(next)`         | Replaces the entire array                     |

All four delegate to `updateXSlice` on `AppDataProvider`. `setX` is a full replacement — it does not merge.

Slice updaters accept an updater function (`(prev) => next`); returning the same reference short-circuits. `AppDataProvider.bulkUpdate` exists for atomic multi-slice writes (e.g. JSON import) and applies one debounced save instead of N.

## Built-in entities

`TemplatesProvider` and `ExercisesProvider` both seed records with `builtin: true` from `defaultAppData()`. Provider-level guards enforce:

- `update` short-circuits if the target has `builtin: true` (returns the existing record unchanged).
- `remove` filters out only non-builtin records (`e.id !== id || e.builtin`).

UI surfaces this as a Lock badge with a Clone action instead of Edit/Delete. Do not bypass these guards — built-ins are the safety net for clinicians who delete their own templates.

## First-run guard

`FirstRunGuard` checks `clinician.name.trim() === ''` on every render. When true and the current path is not `/setup`, it issues a `navigate('/setup', { replace: true })`.

- It must wrap the `<Routes>` element; do not move it inside a specific route.
- Do not add "bypass" links or `?skip` query params that skip setup — the guard exists to ensure the clinician profile is populated before the app can render notes.
- The guard runs after the first render (inside `useEffect`), so there is a single frame where children render before the redirect fires. Components must tolerate an empty clinician name.

## Storage cap and audio offload

`safeLocalStorage.setItem` throws if the serialized JSON of a single object exceeds 5 MB (`MAX_OBJECT_BYTES`). The throw is intentional — it surfaces the problem rather than silently dropping data.

Audio recordings are too large for localStorage and live in IndexedDB via `AudioRepository` (`ptnotes-audio` / `recordings`). The `Session` record stores `audioRef = sessionId` — `AudioRepository` is the only place that touches the IDB store. On `resetAll`, both stores are cleared.

## ID generation

Always use `newId()` from `src/utils/ids.ts`, which calls `crypto.randomUUID()`.

Do not use `Date.now()`, incrementing counters, or `Math.random()` as IDs. UUID collisions are astronomically unlikely; timestamp/counter IDs are not stable across imports and can collide under fast batch inserts.

## AI calls go through the Worker proxy

Transcription (Cloudflare Workers AI Whisper) and note generation (Anthropic Messages) are called via our Cloudflare Worker at `/api/transcribe` and `/api/generate`. The Worker holds the provider credentials as server-side secrets; the browser never sees them.

- Wire format: `POST /api/transcribe` takes `Content-Type: application/octet-stream` with raw audio bytes; `POST /api/generate` takes a JSON body. Both expect the `x-ptscribe-key` header — added automatically by `apiFetch` in `src/lib/apiClient.ts`.
- Access control is the `AppGate` 6-digit code persisted in `localStorage` and matched against a SHA-256 hash in `src/lib/gate.ts`. The gate is **obscurity, not authentication** — anyone reading the bundle can derive it. Treat it as a friction layer, not a trust boundary. Worker abuse caps live server-side.
- Do not reintroduce browser-direct calls to `api.cloudflare.com` or `api.anthropic.com` from `src/services/ai/`. The dev proxy in `vite.config.ts` forwards `/api/*` → `localhost:8787` for local Worker development.
- HIPAA disclaimer on Settings still applies: audio and transcripts leave the device en route to the providers, even though they pass through our Worker. Provider `'none'` keeps everything local (Web Speech for live transcript, manual note editing).
- **PHI handling at the providers — know before enabling cloud paths in a regulated deployment:**
  - **Cloudflare Workers AI / Deepgram Nova** receives the raw session audio for cloud transcription.
  - **Anthropic** receives the transcript-bearing user prompt for note generation, and `handleGenerate` sends the system prompt with `cache_control: { type: 'ephemeral' }` (prompt caching). The system prompt is a template, not patient data — but when a Modifier block or template carries PHI it would be cached at Anthropic's edge for the cache TTL (~5 min). The transcript itself rides in the `user` message and is **not** cached.
  - **No BAA is referenced anywhere in this codebase.** A production HIPAA deployment needs signed BAAs with both Cloudflare and Anthropic; absent those, treat the cloud paths as out-of-scope for PHI and rely on `provider: 'none'` + local Whisper.
  - **Scrub PII is opt-in and user-driven**, so the default generate path can send un-scrubbed PHI to Anthropic. If a deployment must minimize PHI egress, make scrub mandatory before the cloud generate/transcribe call rather than relying on the clinician to trigger it.

## Vault and at-rest encryption

When the vault is unlocked, **everything persisted goes through AES-GCM**. The encryption boundary lives inside the Repository layer — callers above it always see plaintext.

- `DataRepository.save/load` round-trips `ptnotes.appData` through `vault.encryptUtf8 / decryptUtf8`. The on-disk envelope shape is `{ v: 1, iv, ciphertext }`.
- `AudioRepository` round-trips both `recordings` and `recording_chunks` Blobs through `vault.encryptBlob / decryptBlob`. `saveRaw` / `loadRaw` are the only paths that bypass encryption and are migration-only.
- Do not add a second persistence path. A direct `safeLocalStorage.setItem('ptnotes.appData', ...)` or `idb.put` outside `AudioRepository` writes plaintext into a database the rest of the app expects to be encrypted, and the next load will mis-route it through the wrong codec.

Key lifecycle (see `src/lib/vault/`):

- KEK = Argon2id over the clinician's passphrase (16-byte salt, 64 MiB / t=3 / p=1). DEK = random AES-GCM-256 key, wrapped under KEK and persisted at `ptnotes.vault`.
- The unwrapped DEK lives in memory only. Tab close evicts it; the next mount requires the passphrase (or recovery code) again. A **recovery code** (ADR-0003) wraps the *same* DEK under a second Argon2id-derived KEK, stored as `recovery` in the vault envelope — so a forgotten passphrase is recoverable on-device or via a portable backup. Losing *both* the passphrase and the recovery code still wipes access. The DEK is unwrapped **extractable** so it can be re-wrapped (changePassphrase, recovery-code generation); safe because any code in an unlocked tab already holds full decrypt power. **No idle-timeout relock exists** — a recording in progress is never interrupted by a vault prompt. If idle-locking is ever reintroduced, it must define WAL-chunk behavior during the locked window.
- `vault.isUnlocked()` is the gate. Repository methods that detect a locked vault while encrypted data exists must return `null` rather than crash, so `AppDataProvider` can fall through to `defaultAppData()` and let `VaultGate` prompt for the passphrase.

Legacy plaintext migration (one-shot):

- `DataRepository.load()` calls `looksLikeEnvelope(raw)` to distinguish encrypted JSON from pre-vault plaintext. Plaintext loads succeed without the vault, then `migrateLegacyPlaintext()` (called from `VaultGate` on first setup) re-saves under the new key.
- `AudioRepository.maybeDecrypt` checks for the WebM magic bytes (`0x1a 0x45 0xdf 0xa3`) on the leading bytes; matches are passed through as plaintext for that single read, then re-encrypted on next save.
- After all data has been re-saved post-vault, every byte at rest is ciphertext. Any future migration that mass-rewrites stored data must be vault-aware.

## Recorder lifecycle (wake lock + visibility)

`useRecorder` owns three resources for the duration of a clip: the `MediaRecorder`, a `'screen'` `WakeLockSentinel`, and a `visibilitychange` listener. All three must be released on every exit path — `stop`, `reset`, error, and unmount — via `teardown()`.

- Wake lock is acquired after `recorder.start()` and tracked in `wakeLockRef`. Browsers auto-release it on `visibilitychange → hidden`; the visibility handler re-acquires it on return-to-foreground only if `recorderRef.current?.state === 'recording'`. Any rewrite that adds a new recorder state must update this gate.
- Wake lock is best-effort. `acquireWakeLock` returns `null` when the API is unavailable or denied. Recording must continue regardless. Do not throw on wake-lock failure or block the start path on it. **Browser support:** the Screen Wake Lock API is unavailable on iOS Safari ≤ 16.3 and on any non-secure context — those clients record without a lock and may screen-lock on long sessions; this is expected and is not a bug to chase.
- The visibility handler also flips a sticky `wasBackgrounded` flag the first time the tab is hidden during a clip. The flag is consumed by `Session.tsx` to surface a "verify duration" warning. It is reset only by the next `start()` or `reset()` — do not clear it on `visibilitychange → visible`.

## Destructive actions use inline confirmation

Never call `window.confirm()`. All destructive or overwrite actions use an inline caution banner rendered in place of (or adjacent to) the triggering button.

Banner anatomy:

```tsx
<div
  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
  style={{
    borderColor: 'var(--color-caution)',
    background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
  }}
>
  <AlertTriangle
    size={13}
    strokeWidth={2}
    style={{ color: 'var(--color-caution)', flexShrink: 0 }}
  />
  <span style={{ color: 'var(--color-caution)' }}>Descriptive warning text.</span>
  <div className="ml-auto flex items-center gap-1.5">
    <button className="btn btn-ghost py-0.5 text-xs" onClick={cancel}>
      Cancel
    </button>
    <button className="btn btn-primary py-0.5 text-xs" onClick={confirm}>
      Yes, [action]
    </button>
  </div>
</div>
```

The guard state (`pendingDelete`, `pendingOverwrite`, `pendingReplace`, etc.) is local `useState` in the component that owns the action. Confirm handlers clear the guard then call the actual action. Cancel handlers clear the guard only. This pattern is used in `ClipsDrawer` (delete clip), `TranscriptPanel` (overwrite transcript, re-merge), `NotePanel` (replace draft), `NoteToolbar` (Regenerate overwrite modal), and `Session` (reset session via `ResetSessionModal`).

## Local-first transcription

**Every session — recorded or uploaded — is automatically transcribed by local Whisper once the combined silence-removed audio blob is ready, regardless of the user's configured transcription provider.**

After the user finishes recording or uploads a clip, `buildMergedAudioForReview` in `useRecordingFlow` silence-trims each individual clip blob, then merges them into a single combined blob (`silencedMergedBlob`). This blob is set in `useTranscriptionFlow` state and flows to `useBackgroundTranscription`.

The background effect in `useBackgroundTranscription` fires once `silencedMergedBlob` is non-null. It calls `transcribeWithLocalWhisper` (whisper-tiny.en ONNX in-browser via parallel worker pool). The result is stored at session level in `session.t2Transcript` and `session.transcript` so the Review tab populates without any manual action. The effect resets and re-runs whenever `silencedMergedBlob` changes, enabling T2 to update automatically when the user adds another clip.

Cloud transcription (Nova-3 via the Cloudflare Worker) is a **separate, explicit user action** ("Improve with AI") that upgrades the local result. It does not replace the background pass — it runs on top of it. Speed-up is applied inline to the same `silencedMergedBlob` only at that moment; it is never pre-computed.

**Do not gate the background pass behind a provider check.** The background pass runs for all provider configurations.

**Do not skip `buildMergedAudioForReview` for uploaded clips.** The `UploadProcessingView` in `Session.tsx` waits for `clip.status === 'ready' | 'transcribed' | 'failed'`, then calls `buildMergedAudioForReview()` which builds `silencedMergedBlob` and kicks off T2. If you bypass this call, the "Processing audio" screen hangs and T2 never fires.

Consequences of violating this rule:
- Uploaded audio silently skips local transcription and the "Processing audio" screen hangs with no escape for the user.
- Users on the 'local' provider get no automatic transcript.
- `session.t2Transcript` is never populated, breaking the "Revert to Draft" flow in `TranscriptPanel`.
- `silencedMergedBlob` remains null, blocking the "Improve with AI" (Nova) path as well.

### Worker pool and device guards

True parallelism requires one worker per concurrent inference job. The ONNX runtime session inside `whisper.worker.ts` is not concurrency-safe on a single worker — a second `transcribe` message posted while the first is in flight will corrupt or block the session. `transcribeFloat32Parallel` therefore spawns a pool of independent workers, each holding its own model instance.

**Pool-size formula** (computed once per call from `navigator.hardwareConcurrency` and `navigator.deviceMemory`):

| Condition | Pool size |
| --- | --- |
| `deviceMemory < 4` OR `hardwareConcurrency ≤ 4` | 1 (sequential) |
| `hardwareConcurrency ≤ 8` | 2 |
| `hardwareConcurrency > 8` | 3 (capped at chunk count) |

Rationale: each worker loads a full copy of the whisper-tiny ONNX weights (~40 MB). On devices with less than 4 GB RAM, or on constrained environments like iOS WKWebView, loading multiple 40 MB models risks OOM — pool size 1 eliminates that risk entirely. Mid-range devices cap at 2; high-core-count desktops get 3. Pool size is always capped at the actual chunk count so idle workers are never spawned.

**Shared state across pool workers.** `_pending` (the in-flight job map) and `_idCounter` are owned by the calling context (the main thread or a coordinator), not by the workers themselves. Each job gets a unique `_idCounter`-derived ID before dispatch; workers reply with that ID so the promise can be resolved. Since IDs are unique and the map is never touched by workers directly, this is safe with any pool size.

**Sequential fallback.** When pool size resolves to 1, `transcribeFloat32Parallel` routes through the same single-worker path as the non-parallel `transcribeFloat32`. No special case required — the pool loop with N=1 is equivalent.

**Do not collapse the pool back to a singleton** as a "simplification." Low-end and low-memory devices already get pool size 1 automatically via the formula above. Removing the pool and hardcoding N=1 breaks parallel throughput for capable devices with no benefit to constrained ones. The complexity is load-bearing.

### Model cache is app-global and survives every reset path

The Whisper weights live in their own IndexedDB database, **`ptscribe-model-cache`** (`whisper.worker.ts`), distinct from `ptnotes-audio` (clip audio) and from `localStorage` (AppData). It is the **sole** cache for the weights — the Workbox SW matches `/api/model/*` as `/\/api\/.*/ → NetworkOnly` *first*, so the service worker never caches them. It is scoped to **neither a `Session` nor a patient**; it is app-global infrastructure. See [ADR-0002](adr/0002-whisper-model-cache-persistence.md).

Rules:

- **No reset path may clear `ptscribe-model-cache`.** `handleResetSession` (`Session.tsx`), demo "Start fresh" (`DemoBootstrap`), and Settings' "Erase ALL local data" (`Settings.tsx`, which calls `audioRepository.clear()`) must all leave it intact. The model is a public, non-PHI asset — preserving it across a full wipe leaks nothing and keeps local transcription instantly ready. A regression test guards this; do not "fix" it by adding a blanket clear-all.
- **`navigator.storage.persist()` is requested for all users at startup** (demo, unauthenticated, authenticated), idempotently. It is the only defense against the browser evicting the weights from IDB. Do not re-gate it behind auth/demo.
- **The `ml-assets` Workbox cache has no `maxAgeSeconds`.** The onnxruntime WASM runtime must not time-expire (Workbox's expiration plugin purges proactively, independent of storage pressure). Rely on `maxEntries` LRU only; content-hashed filenames make a stale entry benign.
- **Cache is cleared only on load *exhaustion*, never on a transient retry.** The interceptor is strictly cache-first with no bypass, so a corrupt file is otherwise permanent. The auto-retry inside `whisperLoader` must stay cache-preserving (it handles the `pipelineLoadPromise` init race); only genuine exhaustion — and the explicit Settings "Clear & re-download model" / gate "Retry" — clears the store. A `CACHE_VERSION` stamp evicts stale files on a deliberate model swap.

## Type changes ripple

Adding a new field to a domain type requires all four of:

1. Type definition in `src/types/index.ts`
2. Zod schema update in `src/schemas/index.ts`
3. Default value in `defaultAppData()` (and any other factory functions)
4. Migration entry in `src/utils/migrations.ts` — bump `APP_DATA_VERSION` and add a `v{N} -> v{N+1}` step

Skipping the migration means existing persisted data will fail `AppDataSchema.safeParse` and be silently reset to defaults on next load.

## PII scrubbing model — R2-only ONNX, interceptor always active

`openai/privacy-filter` has no pre-converted ONNX exports on HuggingFace. `@huggingface/transformers` falls back to `model.safetensors` (the raw PyTorch weights, 400 MB+) when ONNX files are absent, which fails in the browser.

**The ONNX files must be downloaded once and hosted in R2:**

```bash
python scripts/convert-privacy-filter.py
```

No conversion required — the repo ships `onnx/model_quantized.onnx` (INT8) directly.
The script downloads that file plus tokenizer/config files, writes them to `./models/privacy-filter/` (gitignored), and uploads them to R2 under the key prefix `models/privacy-filter/`. No pip installs needed. The fetch interceptor maps `https://huggingface.co/openai/privacy-filter/resolve/main/<file>` → `R2/models/privacy-filter/<file>` on fallback. Do not change this R2 prefix without updating `HF_MODEL_PREFIX` / `R2_MODEL_FOLDER` in `privacyFilter.worker.ts`.

**The model loads lazily** — it downloads only when the user clicks "Scrub PII" for the first time, not at app startup. Do not re-add a preload call in `DemoBootstrap` or any other boot component.

**The fetch interceptor in `privacyFilter.worker.ts` runs in both dev and prod** — unlike `whisper.worker.ts`, which only installs the interceptor in production. The reason: in dev, wrangler's dev server proxies R2 at `/api/model/*` from `localhost`, so the R2 fallback works there too. Removing or gating the interceptor behind `IS_DEV` breaks the feature in dev.

`env.useBrowserCache` is always `false` — the IDB interceptor owns all caching; the browser Cache API is not involved.

Do not add an `if (!IS_DEV)` guard around the interceptor. Do not switch to a different model (e.g. `Xenova/bert-base-NER`) to avoid the conversion step — `openai/privacy-filter` covers dates, phone numbers, emails, and MRNs in addition to named entities, which the general NER model misses.
