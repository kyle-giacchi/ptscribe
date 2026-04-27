import { encodeOpusWebm } from './opusEncoder';
import {
  DEFAULT_VAD_OPTIONS,
  findSpeechRanges,
  type SpeechRange,
  type VadOptions,
} from './vad';

export interface TrimReport {
  originalSec: number;
  keptSec: number;
  droppedSec: number;
  droppedRanges: SpeechRange[];
}

export interface TrimResult {
  trimmed: Blob;
  report: TrimReport;
}

export interface TrimOptions extends Partial<VadOptions> {
  /** Optional override for the AudioContext factory (used by tests). */
  audioContextFactory?: () => AudioContext;
}

/** Trim sustained silent regions from a recorded audio Blob. The original Blob is
 *  never mutated; the caller decides whether to use the trimmed copy. If decoding
 *  fails for any reason, the original Blob is returned untouched. */
export async function trimSilence(
  input: Blob,
  options: TrimOptions = {},
): Promise<TrimResult> {
  const Ctx =
    options.audioContextFactory ??
    (() =>
      new (
        (
          window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }
        ).AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )());
  const ctx = Ctx();

  let audioBuffer: AudioBuffer;
  try {
    const arrayBuffer = await input.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    if ('close' in ctx) ctx.close().catch(() => undefined);
    const totalSec = 0;
    return {
      trimmed: input,
      report: { originalSec: totalSec, keptSec: totalSec, droppedSec: 0, droppedRanges: [] },
    };
  }

  const mono = mixToMono(audioBuffer);
  const sampleRate = audioBuffer.sampleRate;
  const totalSec = mono.length / sampleRate;

  const vadOpts: VadOptions = { ...DEFAULT_VAD_OPTIONS, ...options };
  const ranges = findSpeechRanges(mono, sampleRate, vadOpts);

  // No speech detected — keep original to avoid sending empty audio.
  if (ranges.length === 0) {
    if ('close' in ctx) ctx.close().catch(() => undefined);
    return {
      trimmed: input,
      report: { originalSec: totalSec, keptSec: totalSec, droppedSec: 0, droppedRanges: [] },
    };
  }

  const kept = extractRanges(mono, sampleRate, ranges);
  const encoded = await encodeOpusWebm(kept, sampleRate);

  if ('close' in ctx) ctx.close().catch(() => undefined);

  // If WebCodecs is unavailable or encoding failed, return the original Blob untouched.
  if (!encoded.ok) {
    return {
      trimmed: input,
      report: { originalSec: totalSec, keptSec: totalSec, droppedSec: 0, droppedRanges: [] },
    };
  }

  return { trimmed: encoded.blob, report: summarizeTrim(totalSec, ranges) };
}

/** Concatenate the samples covered by `ranges` (in seconds) into a single Float32Array.
 *  Pure — exported for testing. */
export function extractRanges(
  samples: Float32Array,
  sampleRate: number,
  ranges: SpeechRange[],
): Float32Array {
  let total = 0;
  const clipped = ranges.map((r) => {
    const start = Math.max(0, Math.floor(r.startSec * sampleRate));
    const end = Math.min(samples.length, Math.ceil(r.endSec * sampleRate));
    total += Math.max(0, end - start);
    return { start, end };
  });

  const out = new Float32Array(total);
  let cursor = 0;
  for (const { start, end } of clipped) {
    if (end <= start) continue;
    out.set(samples.subarray(start, end), cursor);
    cursor += end - start;
  }
  return out;
}

/** Build a TrimReport from the kept ranges. Pure — exported for testing. */
export function summarizeTrim(totalSec: number, kept: SpeechRange[]): TrimReport {
  const keptSec = kept.reduce((acc, r) => acc + (r.endSec - r.startSec), 0);
  const dropped: SpeechRange[] = [];
  let cursor = 0;
  for (const r of kept) {
    if (r.startSec > cursor) dropped.push({ startSec: cursor, endSec: r.startSec });
    cursor = Math.max(cursor, r.endSec);
  }
  if (cursor < totalSec) dropped.push({ startSec: cursor, endSec: totalSec });
  return {
    originalSec: totalSec,
    keptSec,
    droppedSec: Math.max(0, totalSec - keptSec),
    droppedRanges: dropped,
  };
}

function mixToMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(buf.length);
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i += 1) out[i] += data[i];
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= buf.numberOfChannels;
  return out;
}
