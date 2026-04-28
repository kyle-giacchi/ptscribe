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

```bash
npm install
npm run dev        # http://localhost:8080
```

You'll need a running Cloudflare Worker that proxies `/api/transcribe` and `/api/generate`. Set the `VITE_WORKER_URL` environment variable (or `.env.local`) to point at it.

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
