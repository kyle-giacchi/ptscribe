import { Muxer, ArrayBufferTarget } from 'webm-muxer';

/** Opus standard frame size. 20ms is the universal default. */
export const FRAME_MS = 20;

/** 32 kbps mono is well above the speech-quality knee for Whisper input. */
const OPUS_BITRATE = 32_000;

export interface PcmFrame {
  offset: number;
  length: number;
  timestampUs: number;
}

export interface EncodeResult {
  /** Encoded Blob if `ok: true`; otherwise an empty Blob — caller should fall back to original. */
  blob: Blob;
  ok: boolean;
}

/** Pure: divide a mono Float32 PCM signal into FRAME_MS-sized frames. The final frame
 *  may be shorter if the signal length isn't a multiple of one frame. */
export function framePcm(samples: Float32Array, sampleRate: number): PcmFrame[] {
  if (samples.length === 0) return [];
  const frameSize = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate));
  const frames: PcmFrame[] = [];
  let offset = 0;
  let timestampUs = 0;
  while (offset < samples.length) {
    const length = Math.min(frameSize, samples.length - offset);
    frames.push({ offset, length, timestampUs });
    timestampUs += Math.round((length / sampleRate) * 1_000_000);
    offset += length;
  }
  return frames;
}

/** Encode mono Float32 PCM as 16-bit mono WAV. Pure — no browser APIs required.
 *  Used as a fallback when WebCodecs is unavailable. */
export function encodePcmWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true);
  w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true);            // chunk size
  v.setUint16(20, 1, true);             // PCM
  v.setUint16(22, 1, true);             // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);             // block align
  v.setUint16(34, 16, true);            // bits per sample
  w(36, 'data'); v.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Encode mono Float32 PCM as `audio/webm; codecs=opus` using the browser's WebCodecs
 *  AudioEncoder. Falls back to `encodePcmWav` (ok: true) when WebCodecs is unavailable
 *  so callers always receive usable audio — silence-trim and speed-up must never silently
 *  return the unmodified original just because the browser lacks AudioEncoder. */
export async function encodeOpusWebm(
  samples: Float32Array,
  sampleRate: number,
): Promise<EncodeResult> {
  const g = globalThis as unknown as {
    AudioEncoder?: typeof AudioEncoder;
    AudioData?: typeof AudioData;
  };
  if (!g.AudioEncoder || !g.AudioData) {
    return { blob: encodePcmWav(samples, sampleRate), ok: true };
  }

  try {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      audio: { codec: 'A_OPUS', sampleRate, numberOfChannels: 1 },
    });

    let encodeError: unknown = null;
    const encoder = new g.AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encodeError = e;
      },
    });
    encoder.configure({
      codec: 'opus',
      sampleRate,
      numberOfChannels: 1,
      bitrate: OPUS_BITRATE,
    });

    for (const frame of framePcm(samples, sampleRate)) {
      const slice = samples.subarray(frame.offset, frame.offset + frame.length);
      const buf = new Float32Array(slice.length);
      buf.set(slice);
      const audioData = new g.AudioData({
        format: 'f32',
        sampleRate,
        numberOfChannels: 1,
        numberOfFrames: frame.length,
        timestamp: frame.timestampUs,
        data: buf.buffer,
      });
      encoder.encode(audioData);
      audioData.close();
    }

    await encoder.flush();
    encoder.close();
    muxer.finalize();

    if (encodeError) {
      return { blob: new Blob([], { type: 'audio/webm' }), ok: false };
    }
    return {
      blob: new Blob([target.buffer], { type: 'audio/webm' }),
      ok: true,
    };
  } catch {
    return { blob: new Blob([], { type: 'audio/webm' }), ok: false };
  }
}
