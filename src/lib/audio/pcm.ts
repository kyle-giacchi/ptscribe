/** Mix all channels of an AudioBuffer down to a single mono Float32Array
 *  by simple averaging. Returns a fresh array; the source is not modified. */
export function mixToMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(buf.length);
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i += 1) out[i] += data[i];
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= buf.numberOfChannels;
  return out;
}
