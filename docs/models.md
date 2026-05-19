# AI Models

Reference for every AI model used in PTScribe: what it does, how files are delivered to the browser, and the caching layers involved.

---

## Model catalog

| Model | Provider | Where it runs | Purpose |
|---|---|---|---|
| `@cf/deepgram/nova-3` | Cloudflare Workers AI | Cloudflare edge | Cloud transcription with speaker diarization |
| `Xenova/whisper-tiny.en` | HuggingFace / Transformers.js | Browser Web Worker | Local (on-device) transcription |
| `openai/privacy-filter` (INT8 ONNX) | HuggingFace / Transformers.js | Browser Web Worker | On-device PII scrubbing |
| `claude-sonnet-4-6` | Anthropic | Cloudflare Worker proxy | Structured note generation |

---

## Model details

### `@cf/deepgram/nova-3` — Cloud transcription

Called via `POST /api/transcribe` on our Cloudflare Worker. No model files are downloaded to the browser. The Worker streams the audio blob to Cloudflare Workers AI and returns a diarized transcript JSON. Requires network; falls back gracefully to local Whisper if unavailable.

Allowed model variants (user-selectable in settings, enforced server-side):
- `@cf/deepgram/nova-3` ← default
- `@cf/openai/whisper` / `@cf/openai/whisper-large-v3-turbo`

### `Xenova/whisper-tiny.en` — Local transcription

Runs in `src/lib/audio/whisper.worker.ts` via `@huggingface/transformers`. Loaded on-demand when a clip needs transcription. ONNX model files (~40 MB) are served from R2 at `/api/model/Xenova/whisper-tiny.en/resolve/main/...`.

No `dtype` option is needed — the default `model.onnx` exists in this repo.

Pre-seeded to R2 with:
```
npx tsx scripts/seed-r2-models.ts
```

### `openai/privacy-filter` — PII scrubbing

Runs in `src/lib/pii/privacyFilter.worker.ts` via `@huggingface/transformers`. This is a token-classification (NER) model used to detect and redact names, dates, locations, and other identifiers from transcripts before sharing or export.

**Important:** The pipeline must be loaded with `dtype: 'q8'` so that Transformers.js requests `onnx/model_quantized.onnx` rather than `model.onnx`. Without this, the library falls back to `model.safetensors` (400 MB+ PyTorch weights), which fails in the browser.

```ts
// privacyFilter.worker.ts
pipeline('token-classification', model, { dtype: 'q8', ... })
```

The HuggingFace repo ships pre-built ONNX INT8 files — no local conversion is required. Files are pre-seeded to R2 with:
```
python scripts/convert-privacy-filter.py
```

R2 key pattern: `openai/privacy-filter/resolve/main/{filename}` (mirrors the HuggingFace URL structure so the fetch interceptor and the Worker's R2 lookup align).

### `claude-sonnet-4-6` — Note generation

Called via `POST /api/generate` on our Cloudflare Worker. No model files are downloaded to the browser. The Worker forwards the request to the Anthropic API using a server-side secret. The browser never sees provider credentials.

---

## Download and caching architecture

```
Browser worker
  │
  ├─ fetch interceptor (privacyFilter.worker.ts / whisper.worker.ts)
  │    │
  │    ├─ IDB cache hit? → return immediately
  │    │
  │    └─ IDB miss → GET /api/model/{model-path}
  │                        │
  │                Cloudflare Worker (index.ts)
  │                        │
  │                        ├─ R2 hit? → serve + set cache headers
  │                        │
  │                        └─ R2 miss → proxy from HuggingFace
  │                                      → write-back to R2 (fire-and-forget)
  │                                      → return to browser
  │
  └─ response cached to IDB (ptscribe-model-cache)
```

### Layers

| Layer | Store | Scope | Purpose |
|---|---|---|---|
| IDB | `ptscribe-model-cache` (IndexedDB) | Per-browser | Avoids repeated downloads after first use |
| R2 | `ptnotes-models` bucket | Global (Cloudflare edge) | Fast CDN delivery; avoids HuggingFace cold origin |
| HuggingFace | `huggingface.co` | Origin | Authoritative source; also the write-back target for R2 |

### Key implementation files

| File | Role |
|---|---|
| `worker/index.ts` → `handleModelFile()` | R2 proxy + HuggingFace fallback + R2 write-back |
| `src/lib/audio/whisper.worker.ts` | Fetch interceptor + IDB cache for Whisper |
| `src/lib/pii/privacyFilter.worker.ts` | Fetch interceptor + IDB cache for privacy filter |
| `scripts/seed-r2-models.ts` | Pre-seeds Whisper model files to R2 |
| `scripts/convert-privacy-filter.py` | Downloads privacy filter ONNX files from HuggingFace and uploads to R2 |

### R2 key convention

R2 keys mirror the HuggingFace URL path, so the Worker's fetch interceptor can derive them directly:

```
HuggingFace URL:  https://huggingface.co/{org}/{model}/resolve/main/{file}
R2 key:                                   {org}/{model}/resolve/main/{file}
/api/model path:  /api/model/             {org}/{model}/resolve/main/{file}
```

This convention must be preserved when seeding models manually.

---

## Seeding R2 (operations runbook)

Run once per deployment (or when R2 bucket is empty/new):

```bash
# Whisper model (~40 MB)
npx tsx scripts/seed-r2-models.ts

# Privacy filter ONNX INT8 model (~45 MB)
python scripts/convert-privacy-filter.py
```

Verify with:
```bash
wrangler r2 object list ptnotes-models --prefix "Xenova/whisper-tiny.en"
wrangler r2 object list ptnotes-models --prefix "openai/privacy-filter"
```

If R2 is not pre-seeded, the Cloudflare Worker will proxy from HuggingFace on first request and write the files back to R2 automatically — so the app works without seeding, but the first user per file takes the HuggingFace cold-download latency hit.
