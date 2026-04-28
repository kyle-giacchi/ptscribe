import { NonRealTimeVAD } from '@ricky0123/vad-web';
import { findSpeechRanges, type SpeechRange, type VadOptions } from './vad';

const SENSITIVITY_THRESHOLDS = {
  low:    { positiveSpeechThreshold: 0.7,  negativeSpeechThreshold: 0.5  },
  medium: { positiveSpeechThreshold: 0.5,  negativeSpeechThreshold: 0.35 },
  high:   { positiveSpeechThreshold: 0.35, negativeSpeechThreshold: 0.2  },
} as const;

export async function findSpeechRangesML(
  samples: Float32Array,
  sampleRate: number,
  opts: VadOptions,
): Promise<SpeechRange[]> {
  try {
    const thresholds = SENSITIVITY_THRESHOLDS[opts.sensitivity];
    const redemptionMs = Math.round(opts.minSilenceSec * 1000);

    const vad = await NonRealTimeVAD.new({
      ...thresholds,
      redemptionMs,
      modelURL: '/silero_vad_legacy.onnx',
      ortConfig: (ort) => {
        // Non-threaded execution — no COOP/COEP headers required.
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = '/';
      },
    });

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
