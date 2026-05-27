/**
 * Recovery code generation + normalization.
 *
 * A recovery code is a high-entropy secret (160 bits) shown once at vault setup.
 * It derives a second KEK (via the same Argon2id `deriveKek`) that wraps the
 * *same* DEK as the passphrase, so a clinician who forgets their passphrase can
 * still unlock on this device or restore a portable backup elsewhere. See ADR-0003.
 *
 * Display form: 8 groups of 4 from a Crockford-style base32 alphabet (no I/L/O/U
 * to avoid transcription errors), e.g. `9F3K-7T2M-...`. The canonical form fed to
 * the KDF is the alphabet string with separators removed and ambiguous characters
 * folded, so a user can retype it with or without dashes and survive I/1, O/0 slips.
 */
import { randomBytes } from './crypto';

/** Crockford base32 alphabet — excludes I, L, O, U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENTROPY_BYTES = 20; // 160 bits ≥ the 128-bit floor in ADR-0003.
const GROUP_SIZE = 4;

/** Encode bytes as base32 over ALPHABET (5 bits/char, no padding). */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Generate a fresh recovery code in display form (groups joined by '-'). */
export function generateRecoveryCode(): string {
  const raw = base32Encode(randomBytes(ENTROPY_BYTES));
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE));
  }
  return groups.join('-');
}

/**
 * Fold a user-entered code to its canonical form for KDF input: uppercase, drop
 * anything outside the alphabet, and map the visually ambiguous characters that
 * are *not* in the alphabet (I, L → 1; O → 0) back to their canonical digits.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[ILO]/g, (c) => (c === 'O' ? '0' : '1'))
    .replace(/[^0-9A-Z]/g, '')
    .replace(/U/g, '');
}
