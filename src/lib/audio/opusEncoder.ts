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

/** Encode mono Float32 PCM as `audio/webm; codecs=opus` using the browser's WebCodecs
 *  AudioEncoder. Returns `{ ok: false }` if WebCodecs is unavailable or encoding throws. */
export async function encodeOpusWebm(
  samples: Float32Array,
  sampleRate: number,
): Promise<EncodeResult> {
  const g = globalThis as unknown as {
    AudioEncoder?: typeof AudioEncoder;
    AudioData?: typeof AudioData;
  };
  if (!g.AudioEncoder || !g.AudioData) {
    return { blob: new Blob([], { type: 'audio/webm' }), ok: false };
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
