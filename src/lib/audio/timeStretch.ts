import { SoundTouch } from 'soundtouchjs';
import { encodeOpusWebm } from './opusEncoder';
import { mixToMono } from './pcm';

export const SUPPORTED_SPEEDS = [1.25, 1.5, 1.75] as const;
export type SpeedFactor = (typeof SUPPORTED_SPEEDS)[number];
export const DEFAULT_SPEED: SpeedFactor = 1.5;

export interface SpeedUpReport {
  originalSec: number;
  outputSec: number;
  speed: number;
  savedSec: number;
}

export interface SpeedUpResult {
  result: Blob;
  report: SpeedUpReport;
}

export interface SpeedUpOptions {
  audioContextFactory?: () => AudioContext;
}

export function computeOutputDuration(originalSec: number, speed: number): number {
  if (originalSec === 0) return 0;
  if (speed === 1) return originalSec;
  return originalSec / speed;
}

export function buildSpeedUpReport(originalSec: number, speed: number): SpeedUpReport {
  const outputSec = computeOutputDuration(originalSec, speed);
  return {
    originalSec,
    outputSec,
    speed,
    savedSec: Math.max(0, originalSec - outputSec),
  };
}

/** Apply pitch-preserving time-stretch using soundtouchjs. soundtouchjs operates
 *  on stereo interleaved buffers internally; for mono input we duplicate to stereo,
 *  process, and take the left channel.
 *
 *  Uses the batch putSamples/process/drain pattern — the SimpleFilter streaming
 *  API requires ≥ 16384 input frames before it produces output, which makes it
 *  unsuitable for short clips. */
export function applyTempoSoundTouch(
  samples: Float32Array,
  _sampleRate: number,
  tempo: number,
): Float32Array {
  if (samples.length === 0) return new Float32Array(0);

  // SoundTouch constructor ignores sampleRate — it's a no-op param; tempo is set below.
  const st = new SoundTouch();
  st.tempo = tempo;
  st.pitch = 1;

  // Interleave mono → stereo (library expects stereo-interleaved Float32).
  const stereoIn = new Float32Array(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    stereoIn[i * 2] = samples[i];
    stereoIn[i * 2 + 1] = samples[i];
  }
  st.inputBuffer.putSamples(stereoIn, 0, samples.length);

  // Pad with silence so the algorithm drains its internal buffers. Without this,
  // the last sampleReq frames stay in the input buffer and are never emitted.
  const FLUSH_FRAMES = 8192;
  st.inputBuffer.putSamples(new Float32Array(FLUSH_FRAMES * 2), 0, FLUSH_FRAMES);

  // Process all available windows in one pass.
  st.process();

  // Drain the output buffer, clamped to the expected output length so the silence
  // padding frames don't bleed into the result.
  const expectedFrames = Math.round(samples.length / tempo);
  const availableFrames = st.outputBuffer.frameCount;
  const outputFrames = Math.min(availableFrames, expectedFrames);
  if (outputFrames === 0) return new Float32Array(0);

  const stereoOut = new Float32Array(outputFrames * 2);
  st.outputBuffer.receiveSamples(stereoOut, outputFrames);

  // Extract left (mono) channel.
  const out = new Float32Array(outputFrames);
  for (let i = 0; i < outputFrames; i += 1) out[i] = stereoOut[i * 2];
  return out;
}

/** Pitch-preserved time-stretch a recorded audio Blob and re-encode as
 *  audio/webm; codecs=opus. The original Blob is never mutated. Any failure
 *  in decoding, stretching, or encoding falls through to returning the input
 *  Blob untouched — speed-up must never block transcription. */
export async function speedUpAudio(
  input: Blob,
  speed: SpeedFactor,
  options: SpeedUpOptions = {},
): Promise<SpeedUpResult> {
  const Ctx =
    options.audioContextFactory ??
    (() => {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const C = w.AudioContext ?? w.webkitAudioContext;
      if (!C) throw new Error('AudioContext unavailable');
      return new C();
    });
  const ctx = Ctx();

  let audioBuffer: AudioBuffer;
  try {
    const arrayBuffer = await input.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    if ('close' in ctx) ctx.close().catch(() => undefined);
    return {
      result: input,
      report: { originalSec: 0, outputSec: 0, speed, savedSec: 0 },
    };
  }

  const sampleRate = audioBuffer.sampleRate;
  const mono = mixToMono(audioBuffer);
  const originalSec = mono.length / sampleRate;

  let stretched: Float32Array;
  try {
    stretched = applyTempoSoundTouch(mono, sampleRate, speed);
  } catch {
    if ('close' in ctx) ctx.close().catch(() => undefined);
    return {
      result: input,
      report: { originalSec, outputSec: originalSec, speed, savedSec: 0 },
    };
  }

  const encoded = await encodeOpusWebm(stretched, sampleRate);
  if ('close' in ctx) ctx.close().catch(() => undefined);

  if (!encoded.ok) {
    return {
      result: input,
      report: { originalSec, outputSec: originalSec, speed, savedSec: 0 },
    };
  }

  return {
    result: encoded.blob,
    report: buildSpeedUpReport(originalSec, speed),
  };
}
