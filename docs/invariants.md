# Invariants

Non-obvious rules that break things silently if violated. Read before editing any cross-cutting concern.

## Provider nesting order

`App.tsx` wraps providers in this exact order (outermost first):

```
BrowserRouter
  AppDataProvider          <- owns localStorage read/write
    ClinicianProvider
      PatientsProvider
        SessionsProvider
          NotesProvider
            TemplatesProvider
              ExercisesProvider
                PlansProvider
                  SettingsProvider
                    FirstRunGuard
                      Routes
```

All slice providers call `useAppData()` internally — they must be nested inside `AppDataProvider`. Reordering slice providers among themselves is safe. Moving any slice provider outside `AppDataProvider` will throw at runtime.

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

## Vault and at-rest encryption

When the vault is unlocked, **everything persisted goes through AES-GCM**. The encryption boundary lives inside the Repository layer — callers above it always see plaintext.

- `DataRepository.save/load` round-trips `ptnotes.appData` through `vault.encryptUtf8 / decryptUtf8`. The on-disk envelope shape is `{ v: 1, iv, ciphertext }`.
- `AudioRepository` round-trips both `recordings` and `recording_chunks` Blobs through `vault.encryptBlob / decryptBlob`. `saveRaw` / `loadRaw` are the only paths that bypass encryption and are migration-only.
- Do not add a second persistence path. A direct `safeLocalStorage.setItem('ptnotes.appData', ...)` or `idb.put` outside `AudioRepository` writes plaintext into a database the rest of the app expects to be encrypted, and the next load will mis-route it through the wrong codec.

Key lifecycle (see `src/lib/vault/`):

- KEK = PBKDF2-SHA-256 over the clinician's passphrase (16-byte salt, 600k iters). DEK = random AES-GCM-256 key, wrapped under KEK and persisted at `ptnotes.vault`.
- The unwrapped DEK lives in memory only. Tab close evicts it; the next mount requires the passphrase again. There is no recovery — losing the passphrase wipes access to all encrypted data.
- `vault.isUnlocked()` is the gate. Repository methods that detect a locked vault while encrypted data exists must return `null` rather than crash, so `AppDataProvider` can fall through to `defaultAppData()` and let `VaultGate` prompt for the passphrase.

Legacy plaintext migration (one-shot):

- `DataRepository.load()` calls `looksLikeEnvelope(raw)` to distinguish encrypted JSON from pre-vault plaintext. Plaintext loads succeed without the vault, then `migrateLegacyPlaintext()` (called from `VaultGate` on first setup) re-saves under the new key.
- `AudioRepository.maybeDecrypt` checks for the WebM magic bytes (`0x1a 0x45 0xdf 0xa3`) on the leading bytes; matches are passed through as plaintext for that single read, then re-encrypted on next save.
- After all data has been re-saved post-vault, every byte at rest is ciphertext. Any future migration that mass-rewrites stored data must be vault-aware.

## Recorder lifecycle (wake lock + visibility)

`useRecorder` owns three resources for the duration of a clip: the `MediaRecorder`, a `'screen'` `WakeLockSentinel`, and a `visibilitychange` listener. All three must be released on every exit path — `stop`, `reset`, error, and unmount — via `teardown()`.

- Wake lock is acquired after `recorder.start()` and tracked in `wakeLockRef`. Browsers auto-release it on `visibilitychange → hidden`; the visibility handler re-acquires it on return-to-foreground only if `recorderRef.current?.state === 'recording'`. Any rewrite that adds a new recorder state must update this gate.
- Wake lock is best-effort. `acquireWakeLock` returns `null` when the API is unavailable or denied. Recording must continue regardless. Do not throw on wake-lock failure or block the start path on it.
- The visibility handler also flips a sticky `wasBackgrounded` flag the first time the tab is hidden during a clip. The flag is consumed by `Session.tsx` to surface a "verify duration" warning. It is reset only by the next `start()` or `reset()` — do not clear it on `visibilitychange → visible`.

## Type changes ripple

Adding a new field to a domain type requires all four of:

1. Type definition in `src/types/index.ts`
2. Zod schema update in `src/schemas/index.ts`
3. Default value in `defaultAppData()` (and any other factory functions)
4. Migration entry in `src/utils/migrations.ts` — bump `APP_DATA_VERSION` and add a `v{N} -> v{N+1}` step

Skipping the migration means existing persisted data will fail `AppDataSchema.safeParse` and be silently reset to defaults on next load.
