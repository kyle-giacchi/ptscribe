/**
 * Plaintext-audio container sniffer.
 *
 * New encrypted blobs are prefixed with PTSC_MAGIC (4 bytes) so detection is
 * explicit. Legacy encrypted blobs have no tag — anything unrecognized as a
 * plaintext container is assumed encrypted (backward-compatible fallback).
 *
 * This recognizes the formats `MediaRecorder` actually emits across browsers:
 *  - WebM / Matroska: EBML header `1A 45 DF A3` (Chromium, Firefox)
 *  - MP4 / M4A:       `ftyp` box at byte 4 (Safari)
 *  - Ogg:             `OggS` at byte 0
 *  - WAV (RIFF):      `RIFF` at byte 0, `WAVE` at byte 8
 */

export const PTSC_MAGIC = [0x50, 0x54, 0x53, 0x43]; // 'PTSC'

const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const FTYP = [0x66, 0x74, 0x79, 0x70]; // 'ftyp'
const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53]; // 'OggS'
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // 'RIFF'
const WAVE_MAGIC = [0x57, 0x41, 0x56, 0x45]; // 'WAVE'

function matchesAt(bytes: Uint8Array, offset: number, magic: number[]): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

export function isPtscEncrypted(bytes: Uint8Array): boolean {
  return matchesAt(bytes, 0, PTSC_MAGIC);
}

export function isPlaintextAudio(bytes: Uint8Array): boolean {
  if (isPtscEncrypted(bytes)) return false; // explicit PTScribe encrypted tag
  if (matchesAt(bytes, 0, WEBM_MAGIC)) return true;
  if (matchesAt(bytes, 4, FTYP)) return true;
  if (matchesAt(bytes, 0, OGG_MAGIC)) return true;
  if (matchesAt(bytes, 0, RIFF_MAGIC) && matchesAt(bytes, 8, WAVE_MAGIC)) return true;
  return false;
}
