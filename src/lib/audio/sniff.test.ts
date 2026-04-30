import { describe, expect, it } from 'vitest';
import { isPlaintextAudio, isPtscEncrypted, PTSC_MAGIC } from './sniff';

describe('isPlaintextAudio', () => {
  it('recognizes WebM/Matroska EBML header', () => {
    expect(isPlaintextAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe(true);
  });

  it('recognizes MP4/M4A ftyp box (Safari MediaRecorder output)', () => {
    // Typical Safari output: `....ftypM4A ...`
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
    ]);
    expect(isPlaintextAudio(bytes)).toBe(true);
  });

  it('recognizes Ogg', () => {
    const bytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]);
    expect(isPlaintextAudio(bytes)).toBe(true);
  });

  it('recognizes WAV (RIFF + WAVE)', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(isPlaintextAudio(bytes)).toBe(true);
  });

  it('rejects RIFF without WAVE marker (e.g. AVI)', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(isPlaintextAudio(bytes)).toBe(false);
  });

  it('rejects random bytes (encrypted payload)', () => {
    const bytes = new Uint8Array([0xff, 0x00, 0xab, 0x12, 0x99, 0x77, 0x33, 0x55]);
    expect(isPlaintextAudio(bytes)).toBe(false);
  });

  it('rejects buffers shorter than every supported magic', () => {
    expect(isPlaintextAudio(new Uint8Array([0x1a, 0x45]))).toBe(false);
    expect(isPlaintextAudio(new Uint8Array([]))).toBe(false);
  });

  it('rejects PTSC-tagged encrypted blobs', () => {
    const tagged = new Uint8Array([...PTSC_MAGIC, 0xab, 0xcd, 0xef]);
    expect(isPlaintextAudio(tagged)).toBe(false);
  });
});

describe('isPtscEncrypted', () => {
  it('returns true for PTSC-tagged blobs', () => {
    expect(isPtscEncrypted(new Uint8Array([0x50, 0x54, 0x53, 0x43, 0x00]))).toBe(true);
  });

  it('returns false for plaintext audio', () => {
    expect(isPtscEncrypted(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).toBe(false);
  });

  it('returns false for short buffers', () => {
    expect(isPtscEncrypted(new Uint8Array([0x50, 0x54]))).toBe(false);
  });
});
