import { encodePcmWav } from './opusEncoder';
import { mixToMono } from './pcm';

/** Decode and concatenate multiple audio Blobs into a single mono WAV Blob.
 *  Blobs are processed in order. Decoding failures on individual blobs are
 *  skipped; throws only if every blob fails or the input is empty. */
export async function mergeAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('No blobs to merge');

  const ctx = new AudioContext();
  const results = await Promise.allSettled(
    blobs.map((b) => b.arrayBuffer().then((ab) => ctx.decodeAudioData(ab.slice(0)))),
  );
  ctx.close().catch(() => undefined);

  const buffers = results
    .filter((r): r is PromiseFulfilledResult<AudioBuffer> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (buffers.length === 0) throw new Error('Could not decode any clip audio');

  const sampleRate = buffers[0].sampleRate;
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(mixToMono(buf), offset);
    offset += buf.length;
  }

  return encodePcmWav(merged, sampleRate);
}
