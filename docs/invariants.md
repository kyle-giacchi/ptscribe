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

## BYO API key — no server proxy

Transcription (OpenAI Whisper) and note generation (Anthropic Messages) are called directly from the browser using a key the clinician pastes into Settings. There is no backend.

- Anthropic requests include the `anthropic-dangerous-direct-browser-access: true` header.
- Keys are persisted in `Settings.ai.{transcription,generation}.apiKey` inside `AppData`.
- Settings page surfaces a HIPAA disclaimer — recordings and transcripts leave the device when these providers are used. Provider `'none'` keeps everything local (Web Speech for live transcript, manual note editing).

## Type changes ripple

Adding a new field to a domain type requires all four of:

1. Type definition in `src/types/index.ts`
2. Zod schema update in `src/schemas/index.ts`
3. Default value in `defaultAppData()` (and any other factory functions)
4. Migration entry in `src/utils/migrations.ts` — bump `APP_DATA_VERSION` and add a `v{N} -> v{N+1}` step

Skipping the migration means existing persisted data will fail `AppDataSchema.safeParse` and be silently reset to defaults on next load.
