# CLAUDE.md — PTScribe

**PTScribe** is a note-taking + transcription app for physical therapists, modeled on Heidi-style "record the visit, get a structured note." All clinical data stays on-device (`localStorage` + IndexedDB). Tracks patients, sessions (audio + transcript + generated note), customizable templates, an exercise library, and per-patient plans of care. Headline workflow: open a session → record (or dictate) → transcribe → generate a structured note (Anthropic) → finalize. Transcription has two paths: **cloud** (`@cf/deepgram/nova-3` via Cloudflare Workers AI, with speaker diarization) and **local** (on-device `Xenova/whisper-tiny.en` via `@huggingface/transformers` in a Web Worker). A Cloudflare Worker serves as the AI proxy (`/api/*`) and auth backend (`/api/auth`); it never stores clinical data.

## Before editing

1. **Read [CONTEXT.md](CONTEXT.md) for the shared vocabulary.** It is the glossary for the core workflow (Capture → Curate → Generate → Finalize) and the canonical names for clinician-facing concepts (curated transcript, note staleness, Improve with AI, Scrub PII, Modifiers, audio retention, demo mode, etc.). Use these terms in code, UI, and PRs. If you find code or docs using older names, treat CONTEXT.md as the source of truth for _vocabulary_. Note: CONTEXT.md describes the intended workflow — some sections (14-day audio sweep, Modifiers, demo namespace) are not yet fully implemented; check the code before assuming they exist. (The old "locked transcript / unlock-destroys-Note" model was **replaced** by the lighter [Note staleness](CONTEXT.md#note-staleness) model — there is no transcript lock.)
2. **Read [docs/invariants.md](docs/invariants.md) first.** It lists the non-obvious rules (single-write-path persistence, provider nesting, slice mutator pattern, schema validation at boundaries, built-in template/exercise guards, Worker-proxied AI calls, vault encryption boundary, recorder lifecycle, etc.). The Quick lookup table below and the [Documentation](#documentation) section are the nav hub — read targeted section ranges instead of whole files.
3. Run `npm run dev` (http://localhost:8080) and try the feature in a browser before reporting a task as complete.

## Quick lookup

| Question                                 | Answer / Pointer                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where do mutations write?                | `component → slice provider mutator → AppDataProvider.updateXSlice → DataRepository.save` ([invariants.md:25](docs/invariants.md#single-write-path))                                                                                                                                                                |
| Where does audio live?                   | IndexedDB (`ptnotes-audio` / `recordings`) via `AudioRepository`. `Session.audioRef = sessionId`. Never localStorage.                                                                                                                                                                                               |
| What unit are dates?                     | ms timestamp (`number`) — `Date.now()`-style                                                                                                                                                                                                                                                                        |
| What unit is `Session.durationMin`?      | Minutes (number)                                                                                                                                                                                                                                                                                                    |
| Adding a new domain field?               | 4-step ripple: types → schema → defaultAppData → migration ([invariants.md:111](docs/invariants.md#type-changes-ripple))                                                                                                                                                                                            |
| Where does load-time validation happen?  | `DataRepository.load()` calls `safeParse()` on `AppDataSchema` once ([invariants.md:48](docs/invariants.md#schema-validation-at-boundaries))                                                                                                                                                                        |
| Which hook for which slice?              | Provider/mutator table at [architecture.md:58](docs/architecture.md#provider-responsibilities)                                                                                                                                                                                                                      |
| Built-in templates / exercises?          | Provider-level guards make `update`/`remove` no-ops when `builtin: true`. UI shows Clone, not Edit. ([invariants.md:73](docs/invariants.md#built-in-entities))                                                                                                                                                      |
| Default cloud transcription model?       | `@cf/deepgram/nova-3` (Cloudflare Workers AI, speaker diarization) via `/api/transcribe`. Allowlisted Whisper variants available in Settings.                                                                                                                                                                       |
| Default local transcription model?       | `Xenova/whisper-tiny.en` — see `src/services/ai/client/localWhisper.ts`. Model files served from R2 at `/api/model/*`; falls back to HuggingFace if R2 is empty. Pre-populate with `npx tsx scripts/seed-r2-models.ts`.                                                                                             |
| Default note generation model?           | `claude-sonnet-4-6` (Anthropic) via `/api/generate`; the browser never sees provider credentials.                                                                                                                                                                                                                   |
| All models, caching strategy, R2 seeding | [architecture.md — AI model catalog](docs/architecture.md#ai-model-catalog) — catalog, download/IDB/R2 layers, `dtype: 'q8'` requirement for privacy filter, seeding runbook                                                                                                                                        |
| ID generation?                           | Always `newId()` from `src/utils/ids.ts` (UUID); never timestamps                                                                                                                                                                                                                                                   |
| Where is data encrypted?                 | Inside `DataRepository` (AppData) and `AudioRepository` (audio Blobs + chunks). AES-GCM via `src/lib/vault/`. ([invariants.md — Vault](docs/invariants.md#vault-and-at-rest-encryption))                                                                                                                            |
| Who owns the wake lock during recording? | `useRecorder` — released on stop/reset/error/unmount. ([invariants.md — Recorder lifecycle](docs/invariants.md#recorder-lifecycle-wake-lock--visibility))                                                                                                                                                           |
| Demo mode build flag?                    | `VITE_DEMO_MODE=false` to disable. Default is **ON** — auto-unlocks vault with a hardcoded passphrase, skips first-run wizard, seeds a demo patient. **Cloud transcription (Nova) is hard-disabled in demo mode**; T2 local Whisper and Anthropic note generation remain on. Must be `false` for production builds. |
| Cloud transcription cap per session?     | **1** total Nova call per session, lifetime. Counter persists with the Session entity and is not reset by Revert, Unlock, reload, or any client action. Consumed by "Improve with AI" or the T2-failure dialog's cloud option. See [CONTEXT.md §Cloud-transcription cap](CONTEXT.md#cloud-transcription-cap).       |

## Environment

- **Shell: PowerShell** (Windows 11). Use PowerShell syntax in all shell commands — `$env:VAR`, backtick line continuation, `$null` not `/dev/null`. Bash is available via the Bash tool but PowerShell is the default shell.

## Commands

```
npm run dev              Dev server on port 8080
npm run build            Production build
npm run build:dev        Dev-mode build (no minification)
npm run lint             ESLint. Target: 0 errors. Note: pre-commit hook runs typecheck + vitest but NOT lint — run this manually before PRs.
npm run format           Prettier write
npm run format:check     Prettier check (CI gate)
npm run preview          Preview production build locally
npm run typecheck        tsc --noEmit -p tsconfig.app.json  <- NOT root tsconfig.json
npm run test             Vitest (jsdom)
npm run test:coverage    Vitest with v8 coverage
npm run test:e2e         Playwright E2E
npm run test:e2e:ui      Playwright interactive UI mode
npm run test:e2e:update  Update Playwright snapshots

npx tsx scripts/seed-r2-models.ts   Pre-populate R2 with Whisper model files (run once before first deploy)
```

## Stack

See [README.md](README.md) for the full stack overview. Key agent-relevant details:

- AI calls go through our Cloudflare Worker proxy (`/api/transcribe`, `/api/generate`) — provider credentials are server-side secrets; the browser never sees them.
- Local Whisper transcription runs entirely in the browser via a Web Worker (`src/lib/audio/whisper.worker.ts`). Model files are served from R2 at `/api/model/*`, with a HuggingFace fallback. The fetch interceptor in the worker caches files in IDB after first download.
- Auth (BetterAuth with passkey + magic link) is served by the Worker at `/api/auth`. Transactional email (`worker/email.ts`) sends via **Resend**; it requires the `RESEND_API_KEY` secret + an `EMAIL_FROM` on a Resend-verified domain (DKIM/SPF). **Without `RESEND_API_KEY` set it falls back to `console.warn`** (the link is logged, not emailed) — fine for local dev, but the secret must be set before enabling auth in production. See ADR-0004.
- Org management (create org, validate invite token) is handled at `/api/org/**`.

## Documentation

`CONTEXT.md` (glossary) + this file's [Quick lookup](#quick-lookup) table are the nav hub — there is no separate index file. The maintained doc set is deliberately small; branch out sparingly. Pinpoint-read by section; don't pull whole files. See [ADR-0005](docs/adr/0005-documentation-taxonomy.md) for the taxonomy rationale.

**Glossary (read first for naming)**

- [CONTEXT.md](CONTEXT.md) — shared vocabulary for the core workflow; the glossary, not a spec.

**Technical reference**

- [docs/invariants.md](docs/invariants.md) — non-obvious rules; read before any cross-cutting edit
- [docs/architecture.md](docs/architecture.md) — provider tree, data flow, storage, AI services + model catalog, security/local-first boundaries, units
- [docs/workflows.md](docs/workflows.md) — domain model (entities, AI prompt shape) + end-to-end workflows and state machines
- [docs/transcription.md](docs/transcription.md) — transcription pipeline: cloud vs local paths, VAD, chunking, T1/T2/T3 tiers
- [docs/style-guide.md](docs/style-guide.md) — UI conventions

**Product strategy**

- [PRODUCT.md](PRODUCT.md) — purpose, brand, design principles, and the two anchor personas (Dana, Marcus)

**Decisions & other**

- [docs/adr/](docs/adr/) — Architecture Decision Records (hard-to-reverse, surprising-without-context choices)
- [docs/analysis/](docs/analysis/) — isolated one-off, point-in-time work (reviews, cost studies, content drafts); date-stamped, **not** maintained reference — see its README
- [docs/superpowers/specs/](docs/superpowers/specs/) — design specs (untracked)

## Git workflow

- Default branch for all feature/design/bugfix/refactor work: **`main`**.
- Only touch `cloudflare-deployment` when explicitly asked ("push to cloudflare", "deploy this", "update the cloudflare branch"). To propagate: `git checkout cloudflare-deployment && git merge main && git push` (fast-forward expected — that branch is `main` + two deploy-config commits).
- Deploy-config changes (`wrangler.jsonc`, `.github/workflows/deploy.yml`) go on `cloudflare-deployment` directly.
- Files under `docs/superpowers/plans/` and `docs/superpowers/specs/` stay **untracked** — do not commit them.

## Hard rules

- **All clinical data is client-side.** `AppData` lives in `localStorage`; audio lives in IndexedDB. Do not add a server-side database, telemetry, or analytics that exfiltrates session content. The Cloudflare Worker is a proxy only — it never stores or logs clinical data.
- **AI calls go through our Worker proxy.** Whisper and Anthropic are reached via `POST /api/transcribe` and `POST /api/generate` on our Cloudflare Worker; provider credentials are server-side secrets the browser never sees. Requests carry `sha256(PTSCRIBE_GATE)` in `x-ptscribe-key` (obscurity gate — abuse caps live server-side). Settings still surfaces a HIPAA disclaimer because data still leaves the device.
- **Single write path.** Components/hooks never touch `localStorage` or IndexedDB directly — go through a slice provider mutator → `updateXSlice` → `DataRepository.save()`, or through `AudioRepository` for audio Blobs.
- **Validate only at I/O boundaries.** `AppDataSchema.safeParse()` runs on load and on JSON import. Skip it for in-memory state.
- **Built-ins are read-only.** Templates and exercises with `builtin: true` cannot be edited or deleted at the provider level — UI offers Clone instead.
- **Encryption is enforced inside the Repository layer.** When the vault is unlocked, `DataRepository` and `AudioRepository` round-trip every byte through AES-GCM. Do not add a second persistence path that bypasses them. Tab close evicts the in-memory key; there is no passphrase recovery. ([invariants.md — Vault](docs/invariants.md#vault-and-at-rest-encryption))
- **Recorder owns wake lock + visibility.** `useRecorder` holds a `'screen'` wake lock and a `visibilitychange` listener for the lifetime of each clip; both must be released on every exit path (stop, reset, error, unmount). ([invariants.md — Recorder lifecycle](docs/invariants.md#recorder-lifecycle-wake-lock--visibility))
- **Console calls are DEV-only.** All `console.error/warn` calls are wrapped in `if (import.meta.env.DEV)` — Vite tree-shakes them out of production builds. Never add bare console calls.
- **Vault is tab-lifetime only — no idle-lock.** Clinicians mid-visit are never interrupted by a vault prompt. If you introduce an idle relock, it must define WAL-chunk behavior during the locked window. ([invariants.md — Vault](docs/invariants.md#vault-and-at-rest-encryption))
- **Cloud transcription is hard-disabled in demo mode.** The "Improve with AI" action and the T2-failure dialog's cloud option must both be unavailable when `VITE_DEMO_MODE=true`. T2 local Whisper and Anthropic generation remain enabled.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles using default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at root pointing to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.
