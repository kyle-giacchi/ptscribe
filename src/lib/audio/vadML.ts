import { NonRealTimeVAD } from '@ricky0123/vad-web';
import { findSpeechRanges, type SpeechRange, type VadOptions } from './vad';

const SENSITIVITY_THRESHOLDS = {
  low:    { positiveSpeechThreshold: 0.7,  negativeSpeechThreshold: 0.5  },
  medium: { positiveSpeechThreshold: 0.5,  negativeSpeechThreshold: 0.35 },
  high:   { positiveSpeechThreshold: 0.35, negativeSpeechThreshold: 0.2  },
} as const;

// Loading the Silero ONNX model + spinning up an ort wasm session is ~tens of
// MB of allocations. Cache one instance per (sensitivity, redemptionMs) tuple
// so repeated transcribes reuse the same session instead of paying that cost
// each time. We cache the in-flight Promise so concurrent callers share one
// initialization; failed initializations are evicted so the next call retries.
const vadCache = new Map<string, Promise<NonRealTimeVAD>>();

function cacheKey(sensitivity: VadOptions['sensitivity'], redemptionMs: number): string {
  return `${sensitivity}:${redemptionMs}`;
}

async function getOrCreateVad(
  sensitivity: VadOptions['sensitivity'],
  redemptionMs: number,
): Promise<NonRealTimeVAD> {
  const key = cacheKey(sensitivity, redemptionMs);
  const existing = vadCache.get(key);
  if (existing) return existing;

  const promise = NonRealTimeVAD.new({
    ...SENSITIVITY_THRESHOLDS[sensitivity],
    redemptionMs,
    modelURL: '/silero_vad_legacy.onnx',
    ortConfig: (ort) => {
      // Non-threaded execution — no COOP/COEP headers required.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = '/';
    },
  });
  vadCache.set(key, promise);
  promise.catch(() => vadCache.delete(key));
  return promise;
}

/** Test-only: drop the cached VAD instances so each test starts fresh. */
export function __resetVadCacheForTests(): void {
  vadCache.clear();
}

export async function findSpeechRangesML(
  samples: Float32Array,
  sampleRate: number,
  opts: VadOptions,
): Promise<SpeechRange[]> {
  try {
    const redemptionMs = Math.round(opts.minSilenceSec * 1000);
    const vad = await getOrCreateVad(opts.sensitivity, redemptionMs);

    const totalSec = samples.length / sampleRate;
    const runs: SpeechRange[] = [];

    for await (const { start, end } of vad.run(samples, sampleRate)) {
      runs.push({ startSec: start / 1000, endSec: end / 1000 });
    }

    if (runs.length === 0) return [];

    const padSec = opts.padMs / 1000;
    const padded = runs.map((r) => ({
      startSec: Math.max(0, r.startSec - padSec),
      endSec: Math.min(totalSec, r.endSec + padSec),
    }));

    const merged: SpeechRange[] = [];
    for (const r of padded) {
      const last = merged[merged.length - 1];
      if (last && r.startSec <= last.endSec) {
        last.endSec = Math.max(last.endSec, r.endSec);
      } else {
        merged.push({ ...r });
      }
    }

    return merged;
  } catch (err) {
    console.warn('[vadML] ML VAD failed, falling back to energy VAD:', err);
    return findSpeechRanges(samples, sampleRate, opts);
  }
}
