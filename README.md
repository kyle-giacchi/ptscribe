# PTScribe

A client-side note-taking and transcription app for physical therapists. Record a visit, get a structured note — no server, no account, all data stays on your device.

## How it works

1. **Start a session** — select a patient and visit type
2. **Record** — capture audio during the visit (or dictate after)
3. **Transcribe** — Whisper (via Cloudflare Workers AI) converts audio to text with speaker labels
4. **Generate** — Claude (Anthropic) produces a structured SOAP-style note from the transcript
5. **Finalize** — review, edit, and save the note

## Features

- Patient roster with diagnosis tracking
- Session history (audio + transcript + generated note)
- Customizable note templates
- Exercise library with per-patient plans of care
- At-rest encryption (AES-GCM, passphrase-protected vault)
- Fully offline-capable — data lives in `localStorage` and IndexedDB
- Mobile-responsive layout

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Radix)
- **Routing:** React Router 7
- **Validation:** Zod 4
- **Testing:** Vitest + Playwright
- **AI proxy:** Cloudflare Worker (`/api/transcribe`, `/api/generate`) — provider credentials never reach the browser

## Getting started

Local dev requires two processes running at the same time.

**Terminal 1 — Cloudflare Worker (port 8787)**
```bash
npx wrangler dev
```

**Terminal 2 — Vite frontend (port 8080)**
```bash
npm install
npm run dev
```

Vite proxies all `/api/*` requests to `http://127.0.0.1:8787`, so both must be running for transcription and note generation to work.

### First-run: Whisper model download

On the first visit to a session the app downloads the Whisper ONNX model (~150 MB) and caches it in IndexedDB. The "Start Recording" button is disabled until the model is ready.

While the model is downloading you'll see 429 errors in the wrangler log:
```
[wrangler:info] GET /api/model/Xenova/whisper-tiny.en/... 429 Too Many Requests
```
This is expected — wrangler tries to serve the file from R2 (empty locally) and falls back to HuggingFace, which rate-limits server-side requests. The browser falls back to HuggingFace directly and the download proceeds. After the first run the model is in IDB and the 429s stop.

**To skip this on future local setups**, seed R2 once after `wrangler dev` is running:
```bash
npx tsx scripts/seed-r2-models.ts
```
This uploads the model files to the production R2 bucket — after that, wrangler dev serves them from R2 with no HuggingFace requests.

## Scripts

```bash
npm run dev            # Dev server
npm run build          # Production build
npm run typecheck      # tsc --noEmit
npm run test           # Vitest unit tests
npm run test:e2e       # Playwright E2E tests
npm run lint           # ESLint
npm run format         # Prettier
```

## Privacy

All patient data is stored locally in your browser. Audio and session notes never leave your device except through the AI proxy calls (transcription and note generation). No analytics, no accounts, no backend.
