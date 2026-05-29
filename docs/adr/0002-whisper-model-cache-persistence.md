---
status: accepted
---

# Whisper model cache: app-global, eviction-defended, survives data wipe

## Context

Local transcription depends on the `Xenova/whisper-tiny.en` ONNX weights (~40 MB) plus the
onnxruntime-web WASM runtime. Re-downloading these on every recording is the cost we want to avoid.
The weights have exactly **one** cache layer: the IDB database `ptscribe-model-cache`, populated by
the fetch interceptor in `whisper.worker.ts`. The Workbox service worker does **not** cache them —
its first matching rule, `/\/api\/.*/ → NetworkOnly`, wins for `/api/model/*`, so IDB is the sole
store (confirmed by the comment at `whisper.worker.ts`: "IDB interceptor is the sole cache layer").

That made the headline goal — _never reload the model when a user restarts a recording session_ —
already true for the **in-app** reset (`handleResetSession`, demo "Start fresh"): none of them touch
the worker, the `whisperLoader` singleton, or the cache DB. The real exposures were elsewhere:

1. `navigator.storage.persist()` — the only defense against the browser evicting IDB — was gated to
   `!isDemoMode() && isAuthenticated` (`AppDataProvider`) plus a one-shot first-run gate call. The
   most common users (demo, unauthenticated, returning) never requested durable storage.
2. The onnxruntime WASM runtime was cached by Workbox `CacheFirst` with `maxAgeSeconds: 30 days`,
   which the expiration plugin enforces _proactively_, independent of storage pressure — so the
   runtime was force-evicted monthly even when the weights survived.
3. Cache-first with no bypass meant a single corrupt/truncated cached file was **permanent**:
   `whisperLoader.reset()` and the gate's "Retry" re-read the same bad bytes, and no code path
   cleared the cache. Bricked local transcription with no user-reachable recovery.

## Decision

Treat `ptscribe-model-cache` as **app-global infrastructure**, scoped to neither a `Session` nor a
patient, and persist it as aggressively as the platform allows:

1. **Request durable storage for everyone.** Call `navigator.storage.persist()` once at startup,
   idempotently, for demo / unauthenticated / authenticated users alike. It is silent in Chromium
   (granted by engagement/PWA heuristics, no prompt).
2. **The WASM runtime never time-expires.** Remove `maxAgeSeconds` from the `ml-assets` Workbox
   rules; rely on `maxEntries` LRU. Content-hashed filenames make a stale lingering entry benign.
3. **Weights survive a full data wipe.** Settings' "Erase ALL local data" keeps the model cache.
   The model is a _public, non-PHI_ asset, so preserving it leaks nothing and keeps the app instantly
   ready. This is enforced, not incidental — see `docs/invariants.md`.
4. **Corruption self-heals, with a manual escape hatch.** A `CACHE_VERSION` stamp lets a deliberate
   model swap evict stale files. On pipeline-load **exhaustion** (both auto-attempts failed — the
   corruption signal, not a transient blip) the cache is cleared so the next attempt re-downloads
   clean. A Settings "Clear & re-download model" control gives support/power users an explicit lever.

## Considered options

- **Wipe the model cache on "Erase ALL local data"** (literal clean-slate semantics). Rejected: the
  weights are a public asset with zero privacy value to erasing, and re-downloading 40 MB punishes
  the persistence goal for no benefit.
- **Leave `persist()` gated to authenticated non-demo users.** Rejected: demo is the default mode,
  so the common case had no eviction defense at all — directly defeating the goal.
- **Clear the cache on every load failure (eager self-heal).** Rejected: a single network blip during
  `pipeline()` init would discard good cached weights and force a needless 40 MB re-download. Clearing
  only on _exhaustion_ distinguishes corruption from transient failure.

## Consequences

- Page reload still re-instantiates the pipeline in a fresh worker (~seconds of WASM init) — a browser
  limitation we accept; it reads from IDB with **no network download**.
- A clinician's device can accumulate orphaned weights if the default model is ever changed; the
  `CACHE_VERSION` bump is the intended way to GC them on swap.
- "Erase ALL local data" no longer means "erase everything in this origin's storage" — the model
  cache is a deliberate carve-out. A regression test guards this so a future "clear all" change can't
  silently break it.
