import { beforeEach, describe, expect, it } from 'vitest';
import { audioRepository } from './AudioRepository';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';
import { isPtscEncrypted, PTSC_MAGIC } from '@/lib/audio/sniff';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert any Blob → Uint8Array for byte-level comparisons. */
async function toU8(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Build a small Blob from a known byte sequence. */
function makeBlob(bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'audio/webm' });
}

// ── Per-test reset ────────────────────────────────────────────────────────────
// IDB persists across tests in the same fork; clear both stores.
// localStorage must also be cleared so vault.setup() doesn't throw
// "vault: already initialized" when called in successive tests.
beforeEach(async () => {
  localStorage.clear();
  vault.lock();
  await audioRepository.clear();
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('AudioRepository (vault-aware)', () => {
  // ── Locked → plaintext write ────────────────────────────────────────────────
  it('saves plaintext bytes when vault is locked', async () => {
    const input = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]; // WebM magic + payload
    const blob = makeBlob(input);

    await audioRepository.save('s1', blob);

    // loadRaw bypasses decryption — should be identical to the input
    const raw = await audioRepository.loadRaw('s1');
    expect(raw).not.toBeNull();
    const rawBytes = await toU8(raw!);
    expect(Array.from(rawBytes)).toEqual(input);
    expect(isPtscEncrypted(rawBytes)).toBe(false);

    // Normal load should also return the plaintext unchanged
    const loaded = await audioRepository.load('s1');
    expect(loaded).not.toBeNull();
    const loadedBytes = await toU8(loaded!);
    expect(Array.from(loadedBytes)).toEqual(input);
  });

  // ── Unlocked → encrypted write (the privacy invariant) ─────────────────────
  it('persists PTSC-tagged ciphertext — never plaintext — when vault is unlocked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const input = [0x1a, 0x45, 0xdf, 0xa3, 0x0a, 0x0b, 0x0c, 0x0d];
    const blob = makeBlob(input);

    await audioRepository.save('s2', blob);

    // The raw IDB bytes must be PTSC-tagged ciphertext, never the plaintext audio.
    // This is the load-bearing privacy assertion: a regression here means audio
    // PHI is written unencrypted to IndexedDB while the vault is unlocked.
    const raw = await audioRepository.loadRaw('s2');
    expect(raw).not.toBeNull();
    const rawBytes = await toU8(raw!);

    // Must start with PTSC magic ('P','T','S','C' = 0x50 0x54 0x53 0x43)
    expect(isPtscEncrypted(rawBytes)).toBe(true);
    const magic = new Uint8Array(PTSC_MAGIC);
    expect(Array.from(rawBytes.subarray(0, magic.length))).toEqual(Array.from(magic));

    // Must NOT equal the plaintext input bytes
    expect(Array.from(rawBytes)).not.toEqual(input);
    // Ciphertext is longer: PTSC_MAGIC(4) + IV(12) + AES-GCM-tag(16) + ciphertext
    expect(rawBytes.length).toBeGreaterThan(input.length + magic.length);
  });

  // ── Round-trip equality ─────────────────────────────────────────────────────
  it('decrypts back to the original bytes on load (round-trip)', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const input = [0x1a, 0x45, 0xdf, 0xa3, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
    const blob = makeBlob(input);

    await audioRepository.save('s3', blob);
    const loaded = await audioRepository.load('s3');

    expect(loaded).not.toBeNull();
    const loadedBytes = await toU8(loaded!);
    expect(Array.from(loadedBytes)).toEqual(input);
  });

  // ── Locked read of ciphertext ───────────────────────────────────────────────
  // Observed behavior of maybeDecrypt when !isUnlocked():
  //   return new Blob([bytes], { type: mime })
  // i.e. it returns the raw stored bytes (PTSC-tagged ciphertext) as a Blob —
  // it does NOT attempt to decrypt and does NOT return null.
  // Assertion: the returned bytes still begin with PTSC magic (not silently decrypted).
  it('returns PTSC-tagged bytes without decrypting when vault is locked after write', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const input = [0x1a, 0x45, 0xdf, 0xa3, 0xaa, 0xbb, 0xcc];
    await audioRepository.save('s4', makeBlob(input));

    // Lock the vault — decryption is now unavailable.
    vault.lock();

    const loaded = await audioRepository.load('s4');
    // maybeDecrypt returns the raw bytes as-is (not null, not plaintext audio).
    expect(loaded).not.toBeNull();
    const loadedBytes = await toU8(loaded!);

    // The bytes must still be PTSC-tagged ciphertext: vault was locked, so no
    // decryption was attempted. The caller receives opaque ciphertext.
    expect(isPtscEncrypted(loadedBytes)).toBe(true);
    // Must NOT equal the original plaintext
    expect(Array.from(loadedBytes)).not.toEqual(input);
  });

  // ── Legacy untagged plaintext read (isPlaintextAudio fallback) ──────────────
  // saveRaw writes bytes without PTSC tag. On load with vault unlocked, maybeDecrypt
  // sees a WebM-magic prefix → isPlaintextAudio → returns plaintext unchanged.
  it('passes through legacy untagged plaintext audio when vault is unlocked', async () => {
    // WebM magic bytes — recognized as plaintext by isPlaintextAudio
    const legacyBytes = [0x1a, 0x45, 0xdf, 0xa3, 0xff, 0xee, 0xdd];
    await audioRepository.saveRaw('s5', new Uint8Array(legacyBytes));

    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const loaded = await audioRepository.load('s5');
    expect(loaded).not.toBeNull();
    const loadedBytes = await toU8(loaded!);
    // Legacy plaintext path: should return the original bytes unchanged
    expect(Array.from(loadedBytes)).toEqual(legacyBytes);
  });

  // ── saveRaw / loadRaw bypass ────────────────────────────────────────────────
  it('saveRaw/loadRaw bypass encryption even when vault is unlocked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const raw = [0x01, 0x02, 0x03, 0x04, 0x05];
    await audioRepository.saveRaw('s6', new Uint8Array(raw));

    const loaded = await audioRepository.loadRaw('s6');
    expect(loaded).not.toBeNull();
    const loadedBytes = await toU8(loaded!);

    // Must be exactly the bytes written — no PTSC tag, no encryption
    expect(Array.from(loadedBytes)).toEqual(raw);
    expect(isPtscEncrypted(loadedBytes)).toBe(false);
  });

  // ── WAL chunks round-trip + ordering ───────────────────────────────────────
  it('round-trips chunks in index order with encryption when vault is unlocked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const b0 = [0x10, 0x20, 0x30];
    const b1 = [0x40, 0x50, 0x60];

    await audioRepository.appendChunk('s7', 0, makeBlob(b0));
    await audioRepository.appendChunk('s7', 1, makeBlob(b1));

    expect(await audioRepository.hasChunks('s7')).toBe(true);

    const chunks = await audioRepository.loadChunks('s7');
    expect(chunks).toHaveLength(2);

    // Chunks come back decrypted in stored index order (padded key sort)
    expect(Array.from(await toU8(chunks[0]))).toEqual(b0);
    expect(Array.from(await toU8(chunks[1]))).toEqual(b1);
  });

  it('stores each chunk as PTSC-tagged ciphertext at rest when vault is unlocked', async () => {
    await vault.setup('a'.repeat(PASSPHRASE_MIN_CHARS));

    const chunkData = [0xaa, 0xbb, 0xcc, 0xdd];
    await audioRepository.appendChunk('s8', 0, makeBlob(chunkData));

    // Read the chunk via loadRaw to inspect raw IDB bytes
    // (No direct chunk-raw API — use saveRaw+loadRaw-equivalent: save a clip with
    // same id and check via the clip store. Instead, verify indirectly via a locked read.)
    vault.lock();
    const chunks = await audioRepository.loadChunks('s8');
    // Locked read returns raw ciphertext bytes — still PTSC-tagged
    expect(chunks).toHaveLength(1);
    const rawChunkBytes = await toU8(chunks[0]);
    expect(isPtscEncrypted(rawChunkBytes)).toBe(true);
  });

  // ── Chunk mime ──────────────────────────────────────────────────────────────
  it('persists and retrieves chunk mime type', async () => {
    await audioRepository.saveChunkMime('s9', 'audio/ogg');
    expect(await audioRepository.loadChunkMime('s9')).toBe('audio/ogg');
  });

  it('returns default mime type when none has been saved', async () => {
    expect(await audioRepository.loadChunkMime('s10-missing')).toBe('audio/webm');
  });

  // ── listChunkSessionIds ─────────────────────────────────────────────────────
  it('listChunkSessionIds returns session ids deduped and excludes mime: keys', async () => {
    const blob = makeBlob([0x01, 0x02]);

    await audioRepository.appendChunk('alpha', 0, blob);
    await audioRepository.appendChunk('alpha', 1, blob); // second chunk — same session
    await audioRepository.appendChunk('beta', 0, blob);
    await audioRepository.saveChunkMime('alpha', 'audio/ogg'); // mime: key must be excluded

    const ids = await audioRepository.listChunkSessionIds();

    // Both session ids present, deduped
    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
    expect(ids).toHaveLength(2);

    // No mime: entries
    expect(ids.some((id) => id.startsWith('mime:'))).toBe(false);
  });

  // ── remove clears clip + chunks ─────────────────────────────────────────────
  it('remove deletes both the clip and all chunks for that session id', async () => {
    const blob = makeBlob([0x1a, 0x45, 0xdf, 0xa3, 0x01]);

    await audioRepository.save('s11', blob);
    await audioRepository.appendChunk('s11', 0, blob);

    await audioRepository.remove('s11');

    expect(await audioRepository.load('s11')).toBeNull();
    expect(await audioRepository.hasChunks('s11')).toBe(false);
  });

  // ── listKeys / clear ────────────────────────────────────────────────────────
  it('listKeys returns ids of saved clips', async () => {
    const blob = makeBlob([0x1a, 0x45, 0xdf, 0xa3, 0x01]);

    await audioRepository.save('clip-a', blob);
    await audioRepository.save('clip-b', blob);

    const keys = await audioRepository.listKeys();
    expect(keys).toContain('clip-a');
    expect(keys).toContain('clip-b');
    expect(keys).toHaveLength(2);
  });

  it('clear empties both the clip store and the chunk store', async () => {
    const blob = makeBlob([0x1a, 0x45, 0xdf, 0xa3, 0x02]);

    await audioRepository.save('clip-x', blob);
    await audioRepository.appendChunk('clip-x', 0, blob);
    await audioRepository.saveChunkMime('clip-x', 'audio/ogg');

    await audioRepository.clear();

    expect(await audioRepository.listKeys()).toHaveLength(0);
    expect(await audioRepository.listChunkSessionIds()).toHaveLength(0);
    expect(await audioRepository.load('clip-x')).toBeNull();
    expect(await audioRepository.hasChunks('clip-x')).toBe(false);
  });
});
