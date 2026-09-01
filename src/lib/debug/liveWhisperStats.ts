/**
 * In-memory counters for the T1 live-Whisper preview path (leaky bucket in
 * `useCapturePhase`). Diagnostic only: never persisted to AppData, never sent
 * anywhere. Read by the Debug drawer, which is itself DEV-gated via
 * `DEBUG_TOOLS_ENABLED`.
 *
 * Module-level mutable state rather than React state on purpose — this is a hot
 * path and a perf counter must not cause a render.
 */

/** Keep the tail only; a long session would otherwise grow this unbounded. */
const MAX_SAMPLES = 200;

const chunkMs: number[] = [];
let chunks = 0;
let dropped = 0;
let bytes = 0;
let backend: 'webgpu' | 'wasm' | null = null;

export function resetLiveWhisperStats(): void {
  chunkMs.length = 0;
  chunks = 0;
  dropped = 0;
  bytes = 0;
  backend = null;
}

/** Which onnxruntime execution provider the Whisper worker actually loaded. */
export function setLiveWhisperBackend(device: 'webgpu' | 'wasm'): void {
  backend = device;
}

/** A pending chunk was replaced before it was ever transcribed. */
export function recordLiveWhisperDrop(): void {
  dropped++;
}

export function recordLiveWhisperChunk(ms: number, blobBytes: number): void {
  chunks++;
  bytes += blobBytes;
  chunkMs.push(ms);
  if (chunkMs.length > MAX_SAMPLES) chunkMs.shift();
}

export interface LiveWhisperStatsSnapshot {
  chunks: number;
  dropped: number;
  /** dropped / (chunks + dropped), 0–1. */
  dropRate: number;
  /** Median of the last MAX_SAMPLES chunk latencies, ms. */
  medianMs: number;
  lastMs: number;
  /** Mean blob size across transcribed chunks, bytes. */
  meanBytes: number;
  /** Which onnxruntime execution provider the worker loaded, if known yet. */
  backend: 'webgpu' | 'wasm' | null;
}

export function getLiveWhisperStats(): LiveWhisperStatsSnapshot {
  const sorted = [...chunkMs].sort((a, b) => a - b);
  const total = chunks + dropped;
  return {
    chunks,
    dropped,
    dropRate: total ? dropped / total : 0,
    medianMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    lastMs: chunkMs.length ? chunkMs[chunkMs.length - 1] : 0,
    meanBytes: chunks ? bytes / chunks : 0,
    backend,
  };
}
