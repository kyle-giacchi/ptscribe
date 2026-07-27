import { describe, expect, it } from 'vitest';
import { deriveDeviceName, formatPasskeyDate, passkeyError } from './passkey';

describe('passkeyError', () => {
  it('turns the terse "Auth cancelled" code into new-device guidance', () => {
    const msg = passkeyError({ code: 'AUTH_CANCELLED', message: 'Auth cancelled' }, 'sign-in');
    expect(msg).toContain('No passkey was found on this device');
    expect(msg).not.toBe('Auth cancelled');
  });

  it('uses register copy for registration codes', () => {
    expect(passkeyError({ code: 'PREVIOUSLY_REGISTERED' }, 'register')).toContain(
      'already has a passkey',
    );
  });

  it('does not cross tables — a register code falls back on the sign-in path', () => {
    expect(passkeyError({ code: 'PREVIOUSLY_REGISTERED' }, 'sign-in')).toContain(
      'email yourself a link',
    );
  });

  it('maps a raw WebAuthn dismissal DOMException', () => {
    const err = new DOMException('dismissed', 'NotAllowedError');
    expect(passkeyError(err, 'sign-in')).toContain('No passkey was found');
    expect(passkeyError(err, 'register')).toContain('dismissed');
  });

  it('falls back for unknown / malformed errors', () => {
    expect(passkeyError(undefined, 'sign-in')).toContain('Passkey sign-in didn’t work');
    expect(passkeyError({ code: 'WAT' }, 'register')).toContain('Could not register a passkey');
    expect(passkeyError('a string', 'register')).toContain('Could not register a passkey');
  });
});

describe('deriveDeviceName', () => {
  it('names browser and OS', () => {
    expect(
      deriveDeviceName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(
      deriveDeviceName(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
      ),
    ).toBe('Edge on macOS');
  });

  it('degrades gracefully on an unrecognized agent', () => {
    expect(deriveDeviceName('curl/8.0')).toBe('Browser on this device');
  });
});

describe('formatPasskeyDate', () => {
  it('returns empty string for an unparseable date', () => {
    expect(formatPasskeyDate('not-a-date')).toBe('');
  });

  it('formats a real date', () => {
    expect(formatPasskeyDate(new Date('2026-03-14T12:00:00Z'))).not.toBe('');
  });
});
