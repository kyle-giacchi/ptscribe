# PTScribe — Architecture Primer

A reference for designing **net-new UI**. It describes how the app actually behaves today, focused on three areas that constrain any new screen: **security & data boundaries**, **local-first processing**, and the **note-generation flow** (including how clips, silence-trimming, and the T1 live transcript create a fallback chain). Read this before proposing a surface — the constraints here are load-bearing.

## Orientation

PTScribe is a clinical scribe for physical therapists: **record a visit → transcribe → generate a structured note → finalize.**

- **React + TypeScript SPA**, bundled by Vite, served by a single **Cloudflare Worker**.
- **All clinical data is client-side.** `AppData` (patients, sessions, notes, templates) lives in `localStorage`; audio Blobs live in IndexedDB. Every byte is encrypted at rest (AES-GCM) behind a tab-lifetime vault key.
- **The Worker is a proxy + auth backend only** — it never stores or logs clinical data. It forwards AI calls (provider credentials are server-side secrets the browser never sees) and serves the static assets.
- **On-device models** run in Web Workers via transformers.js: local Whisper (transcription) and a NER model (PII scrubbing). Cloud AI is opt-in or explicit.

> Design consequence: there is **no server-side source of truth**. A screen cannot "fetch the patient list from the backend" — it reads from local state. There is no multi-device sync, no server history. The vault key is evicted on tab close with no recovery.

---

## 1. Security & data boundaries

The whole product posture is *data stays on the device unless the clinician sends it to AI*. Three layers enforce that.

### At-rest encryption (the vault)
- A single write path: `component → slice mutator → DataRepository.save()` (and `AudioRepository` for audio). Nothing touches storage directly.
- `DataRepository` and `AudioRepository` round-trip every byte through **AES-GCM**. The data-encryption key is **tab-lifetime, no idle timeout** — unlocked once at app load (passphrase or passkey), held in memory until the tab closes. **No passphrase recovery.**
- Design consequence: a recording in progress is never interrupted by a re-auth prompt. The vault prompt is a cold-open gate, not a mid-session interruption. Any new long-lived flow can assume the key stays available for the tab's life.

### The Worker proxy (the network boundary)
- Two AI routes: `POST /api/transcribe` (Deepgram Nova-3, with a Whisper fallback) and `POST /api/generate` (Anthropic). Both are reached only through our Worker.
- Defense in depth, all server-side:
  - **Origin enforcement** — a *missing* `Origin` header is denied (browsers always send one on `fetch`, so no-Origin means a script/curl).
  - **Obscurity gate** — `x-ptscribe-key` must equal `sha256(PTSCRIBE_GATE)`, compared in constant time. This is *not* auth; it's friction. The real protection is the rate limits.
  - **Rate limits (KV)** — pre-gate 20/min/IP, then 10/min and 300/day per IP, plus a 500/day global ceiling.
  - **Model allowlists** — only three model IDs accepted for transcription, three for generation; anything else is rejected before reaching a provider.
- **CSP is the local-first boundary**: `connect-src 'self' https://huggingface.co` — a single compromised dependency cannot exfiltrate to an attacker server. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`. The model proxy (`/api/model/*`) is allowlisted to three HuggingFace repos so it can't be abused as an open proxy.

### What the AI is allowed to see (the generation bound)
The note-generation request is **strictly bounded** to:
> curated transcript + chosen template (structure + prompts) + visit type + a small patient-context block (first/last name, age derived from `dob`, `primaryDiagnosis`).

**MRN and ICD-10 are never sent. Prior notes, plan of care, and prior sessions are never injected.** If a clinician wants prior context in the prompt, they paste it into the transcript themselves. PII scrubbing happens **on-device** before any send, and is clinician-triggered (never silent).

> Design consequence: any UI that surfaces "what the AI will see" must reflect this bound — it is the transcript + template, both already visible to the clinician. Don't design surfaces that imply the AI has access to the patient's full chart.

---

## 2. Local-first processing

What runs where determines what is *instant* vs. what is a *wait* — the single most important fact for pacing a UI.

| Capability | Where it runs | Network? | UX character |
|---|---|---|---|
| Data read/write + encryption | Browser (Repository + vault) | No | Instant |
| Audio recording, silence-trim, VAD | Browser (Web Audio + ML VAD) | No | Instant / background |
| **T2 local Whisper** (the canonical transcript) | Browser Web Worker pool | No (model fetched once, then IDB-cached) | **Async wait** (seconds–minutes) |
| PII scrub (NER) | Browser Web Worker | No | Short wait, on demand |
| Audio playback | Browser (Blob from IndexedDB) | No | Instant |
| T1 live preview | Worker → Cloudflare Whisper *(or browser Web Speech)* | Yes | Streams during recording |
| T3 Nova ("Improve with AI") | Worker → Deepgram | Yes | Async wait, **capped 1×/session** |
| Note generation | Worker → Anthropic | Yes | Async wait, atomic result |

- **Models load lazily** from R2 via `/api/model/*`, falling back to HuggingFace if the bucket is unseeded, then cache in IndexedDB. First transcription on a fresh browser pays a one-time model download; subsequent ones are local-only.
- The local Whisper worker pool is **sized to the device** (CPU cores + RAM), with a sequential fallback for constrained machines.

> Design consequence: the app is usable **fully offline** except the three explicitly-networked actions (T1 live, T3 Nova, note gen). Everything else — recording, the local transcript, editing, scrubbing, finalizing — works with no connection. Design loading/empty states around the two real waits (T2 and note generation), not around generic "fetching data" spinners.

---

## 3. Note-generation flow (clips → silence → transcript tiers → note)

The path from microphone to note, and the fallback chain that keeps a transcript available even when a step fails.

### Capture → clips
- A session is always owned by a patient. Recording produces one or more **clips**: *pause/resume* stays in one clip; *Stop & Start New* commits the current clip and opens another (e.g. patient stepped out). Clips can be deleted before the final stop. Audio Upload creates one clip per file.
- During recording, a **T1 live preview** accumulates: a VAD-gated segment recorder sends each detected speech segment to Cloudflare Whisper and appends the text, persisting it continuously to `clip.t1Transcript`. (A crash loses only the in-flight segment.) Web Speech API is an opt-in, zero-network T1 alternative.

### Stop → combine → silence-trim
- On final stop, all clips are combined and run through **silence trimming** (`trimSilence`): ML VAD finds speech ranges and concatenates only those, producing the `silencedMergedBlob`. The original audio is never mutated; if decoding or encoding fails, the untrimmed blob is returned untouched. Uploaded audio goes through the same trim — it's not trusted as already-tight.
- Silence removal serves two purposes: it shrinks audio (faster/cheaper transcription) and tightens it so the downstream chunking assumptions hold.

### Transcript tiers (the fallback chain)
The transcript exists in up to four independently stored tiers; `activeTranscriptTier` picks which one is live, with precedence **edited > T3 > T2 > T1**.

| Tier | Source | Network | Role |
|---|---|---|---|
| **T1** | Live VAD segments (Cloud Whisper / Web Speech) | Yes | Safety net captured *during* recording |
| **T2** | Local Whisper on `silencedMergedBlob` | No | **Canonical starting transcript** for editing |
| **T3** | Deepgram Nova-3, explicit "Improve with AI" | Yes | Best quality (diarization); **capped 1×/session, lifetime** |
| **Edited** | Manual edit or PII scrub | No | Clinician's own text, wins over all machine tiers |

- **T2 auto-pass** fires automatically once `silencedMergedBlob` exists — no user action. It chunks at 2-minute boundaries, runs VAD per chunk, and transcribes chunks in parallel. **T2 is frozen once written and is never overwritten by T3**, which makes "revert to the local draft" reliable.
- **Fallback behavior when T2 can't produce text (current code):**
  - *No speech / too short* → a **warning notification** ("Use Improve with AI to retry with cloud"); the clinician lands on an empty editable transcript. Not treated as a hard error.
  - *Local model fails to load* (`WhisperExhaustedError`, after R2→HF fetch exhausted) → T2 enters an `error` phase; the **T1 live preview remains available** as a fallback transcript, and Nova (T3) is the manual escalation.
  - One automatic retry (`MAX_AUTO_RETRIES = 1`) before surfacing failure.
  - *Note:* this is surfaced today via notification/toast, not a blocking two-path dialog — design accordingly.

### Curate → Generate → Finalize
- The clinician edits the transcript, can **Scrub PII** (on-device, reviewed via a diff modal before applying), and can spend the single Nova pass via **Improve with AI**.
- **Generate** sends only the effective transcript (`editedTranscript` if present, else the active tier) plus template + visit type + patient context to `/api/generate`. Modifiers (tone/emphasis/custom) are appended to the system prompt **server-side**. The note returns **atomically** — the full structured response in one shot, no progressive streaming.
- The **Note is the legal artifact; the transcript is the contract** — the AI is asked only to summarize what the clinician approved. The note is presented as one editable block per template section; the clinician finalizes to assert it represents their clinical reasoning.

> Design consequence: the two moments that need real "working…" treatment are the **T2 auto-pass** (between Capture and Curate) and **Generate**. Both are awaited, both can fail visibly, and both have a clinician-facing recovery (retry Nova / retry generate). Everything between — clip management, editing, scrubbing — is local and immediate.
