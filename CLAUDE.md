# CLAUDE.md — PTScribe

**PTScribe** is a 100% client-side note-taking + transcription app for physical therapists, modeled on Heidi-style "record the visit, get a structured note." Tracks patients, sessions (audio + transcript + generated note), customizable templates, an exercise library, and per-patient plans of care. Headline workflow: open a session → record (or dictate) → transcribe (Cloudflare Workers AI Whisper) → generate a structured note (Anthropic) → finalize.

## Before editing

1. **Open [docs/INDEX.md](docs/INDEX.md) to navigate docs by section** — read targeted ranges instead of whole files.
2. **Read [docs/invariants.md](docs/invariants.md) first.** It lists the non-obvious rules (single-write-path persistence, provider nesting, slice mutator pattern, schema validation at boundaries, built-in template/exercise guards, Worker-proxied AI calls, vault encryption boundary, recorder lifecycle, etc.).
3. Run `npm run dev` (http://localhost:8080) and try the feature in a browser before reporting a task as complete.

## Quick lookup

| Question                                | Answer / Pointer                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where do mutations write?               | `component → slice provider mutator → AppDataProvider.updateXSlice → DataRepository.save` ([invariants.md:25](docs/invariants.md#single-write-path)) |
| Where does audio live?                  | IndexedDB (`ptnotes-audio` / `recordings`) via `AudioRepository`. `Session.audioRef = sessionId`. Never localStorage.                                |
| What unit are dates?                    | ms timestamp (`number`) — `Date.now()`-style                                                                                                          |
| What unit is `Session.durationMin`?     | Minutes (number)                                                                                                                                      |
| Adding a new domain field?              | 4-step ripple: types → schema → defaultAppData → migration ([invariants.md:111](docs/invariants.md#type-changes-ripple))                             |
| Where does load-time validation happen? | `DataRepository.load()` calls `AppDataSchema.safeParse` once ([invariants.md:48](docs/invariants.md#schema-validation-at-boundaries))                |
| Which hook for which slice?             | Provider/mutator table at [architecture.md:58](docs/architecture.md#provider-responsibilities)                                                       |
| Built-in templates / exercises?         | Provider-level guards make `update`/`remove` no-ops when `builtin: true`. UI shows Clone, not Edit. ([invariants.md:73](docs/invariants.md#built-in-entities)) |
| Default models?                         | Transcription = `@cf/openai/whisper-large-v3-turbo` (Cloudflare Workers AI); generation = `claude-sonnet-4-6` (Anthropic). Both reached through our Worker proxy at `/api/transcribe` and `/api/generate`; the browser never sees provider credentials. |
| ID generation?                          | Always `newId()` from `src/utils/ids.ts` (UUID); never timestamps                                                                                     |
| Where is data encrypted?                | Inside `DataRepository` (AppData) and `AudioRepository` (audio Blobs + chunks). AES-GCM via `src/lib/vault/`. ([invariants.md — Vault](docs/invariants.md#vault-and-at-rest-encryption)) |
| Who owns the wake lock during recording?| `useRecorder` — released on stop/reset/error/unmount. ([invariants.md — Recorder lifecycle](docs/invariants.md#recorder-lifecycle-wake-lock--visibility)) |

## Commands

```
npm run dev              Dev server on port 8080
npm run build            Production build
npm run build:dev        Dev-mode build (no minification)
npm run lint             ESLint — baseline is 0 errors. The 10 react-refresh/only-export-components warnings (9 slice providers + 1 PDF helper module) are accepted.
npm run format           Prettier write
npm run format:check     Prettier check (CI gate)
npm run preview          Preview production build locally
npm run typecheck        tsc --noEmit -p tsconfig.app.json  <- NOT root tsconfig.json
npm run test             Vitest (jsdom)
npm run test:coverage    Vitest with v8 coverage
npm run test:e2e         Playwright E2E
npm run test:e2e:ui      Playwright interactive UI mode
npm run test:e2e:update  Update Playwright snapshots
```

## Stack

React 19 + TypeScript 6 + Vite 8 (rolldown + oxc) + Tailwind CSS 4 + shadcn/ui (Radix) + React Router 7. Persistence = `localStorage` for `AppData` + IndexedDB for raw audio Blobs. Validation = Zod 4 (I/O boundaries). Testing = Vitest 4 (jsdom) + Playwright. AI = Cloudflare Workers AI Whisper + Anthropic Messages, called browser-direct with credentials the clinician pastes into Settings.

## Documentation

[docs/INDEX.md](docs/INDEX.md) is the nav hub — every doc mapped to section headings. Pinpoint-read; don't pull whole files.

- [docs/invariants.md](docs/invariants.md) — non-obvious rules; read before any cross-cutting edit
- [docs/architecture.md](docs/architecture.md) — provider tree, data flow, storage, AI services, units
- [docs/clinical-model.md](docs/clinical-model.md) — domain entities, session state machine, AI prompt shape
- [docs/style-guide.md](docs/style-guide.md) — UI conventions
- [docs/superpowers/specs/](docs/superpowers/specs/) — design specs

## Hard rules

- **No backend.** No auth, no server, no analytics. All data is `localStorage` (`AppData`) + IndexedDB (audio) — both client-side.
- **AI calls go through our Worker proxy.** Whisper and Anthropic are reached via `POST /api/transcribe` and `POST /api/generate` on our Cloudflare Worker; provider credentials are server-side secrets the browser never sees. Requests carry the `AppGate` 6-digit code in `x-ptscribe-key` (obscurity, not auth — abuse caps live server-side). Settings still surfaces a HIPAA disclaimer because data still leaves the device.
- **Single write path.** Components/hooks never touch `localStorage` or IndexedDB directly — go through a slice provider mutator → `updateXSlice` → `DataRepository.save`, or through `AudioRepository` for audio Blobs.
- **Validate only at I/O boundaries.** `AppDataSchema.safeParse` runs on load and on JSON import. Skip it for in-memory state.
- **Built-ins are read-only.** Templates and exercises with `builtin: true` cannot be edited or deleted at the provider level — UI offers Clone instead.
- **Encryption is enforced inside the Repository layer.** When the vault is unlocked, `DataRepository` and `AudioRepository` round-trip every byte through AES-GCM. Do not add a second persistence path that bypasses them. Tab close evicts the in-memory key; there is no passphrase recovery. ([invariants.md — Vault](docs/invariants.md#vault-and-at-rest-encryption))
- **Recorder owns wake lock + visibility.** `useRecorder` holds a `'screen'` wake lock and a `visibilitychange` listener for the lifetime of each clip; both must be released on every exit path (stop, reset, error, unmount). ([invariants.md — Recorder lifecycle](docs/invariants.md#recorder-lifecycle-wake-lock--visibility))
