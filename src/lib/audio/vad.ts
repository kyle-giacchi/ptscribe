export interface SpeechRange {
  startSec: number;
  endSec: number;
}

export type Sensitivity = 'low' | 'medium' | 'high';

export interface VadOptions {
  frameMs: number;
  hangoverMs: number;
  padMs: number;
  minSilenceSec: number;
  noiseFloorPercentile: number;
  sensitivity: Sensitivity;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  frameMs: 30,
  hangoverMs: 250,
  padMs: 400,
  minSilenceSec: 1.5,
  noiseFloorPercentile: 0.1,
  sensitivity: 'medium',
};

export const SENSITIVITY_MULTIPLIER: Record<Sensitivity, number> = {
  low: 3.0,
  medium: 2.0,
  high: 1.5,
};

/** Detect ranges of speech in mono PCM and return them in seconds.
 *  Algorithm: short-time RMS → noise-floor percentile → threshold → hangover
 *  smoothing → pad → merge → drop short-silence gaps below minSilenceSec. */
export function findSpeechRanges(
  samples: Float32Array,
  sampleRate: number,
  opts: VadOptions = DEFAULT_VAD_OPTIONS,
): SpeechRange[] {
  if (samples.length === 0) return [];

  const frameSize = Math.max(1, Math.round((opts.frameMs / 1000) * sampleRate));
  const totalSec = samples.length / sampleRate;
  const numFrames = Math.floor(samples.length / frameSize);
  if (numFrames === 0) return [];

  // 1. RMS per frame.
  const rms = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f += 1) {
    let sumSq = 0;
    const base = f * frameSize;
    for (let i = 0; i < frameSize; i += 1) {
      const v = samples[base + i];
      sumSq += v * v;
    }
    rms[f] = Math.sqrt(sumSq / frameSize);
  }

  // 2. Noise floor = percentile of RMS values.
  const sorted = Float32Array.from(rms).sort();
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * opts.noiseFloorPercentile)),
  );
  const noiseFloor = Math.max(sorted[idx], 1e-6);
  const threshold = noiseFloor * SENSITIVITY_MULTIPLIER[opts.sensitivity];

  // 3. Per-frame speech flag with hangover.
  const hangoverFrames = Math.max(0, Math.round(opts.hangoverMs / opts.frameMs));
  const speech = new Uint8Array(numFrames);
  let cooldown = 0;
  for (let f = 0; f < numFrames; f += 1) {
    if (rms[f] > threshold) {
      speech[f] = 1;
      cooldown = hangoverFrames;
    } else if (cooldown > 0) {
      speech[f] = 1;
      cooldown -= 1;
    }
  }

  // 4. Build runs of speech frames → seconds.
  const runs: SpeechRange[] = [];
  let runStart = -1;
  for (let f = 0; f < numFrames; f += 1) {
    if (speech[f] && runStart === -1) runStart = f;
    if ((!speech[f] || f === numFrames - 1) && runStart !== -1) {
      const endFrame = speech[f] ? f + 1 : f;
      runs.push({
        startSec: (runStart * frameSize) / sampleRate,
        endSec: (endFrame * frameSize) / sampleRate,
      });
      runStart = -1;
    }
  }
  // 5. Pad each run.
  const padSec = opts.padMs / 1000;
  const padded = runs.map((r) => ({
    startSec: Math.max(0, r.startSec - padSec),
    endSec: Math.min(totalSec, r.endSec + padSec),
  }));

  // 6. Merge runs whose silent gap is below minSilenceSec.
  const merged: SpeechRange[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startSec - last.endSec < opts.minSilenceSec) {
      last.endSec = Math.max(last.endSec, r.endSec);
    } else {
      merged.push({ ...r });
    }
  }

  if (merged.length > 0) return merged;

  // Fallback: if no speech ranges were found but the signal has audible content, the
  // noise-floor estimate was calibrated against speech (all-speech clip), so the threshold
  // was set too high. Return the full clip as a single speech range.
  let sumRms = 0;
  for (let i = 0; i < rms.length; i += 1) sumRms += rms[i];
  const meanRms = sumRms / rms.length;
  if (meanRms > 0.001) {
    return [{ startSec: 0, endSec: totalSec }];
  }

  return [];
}
