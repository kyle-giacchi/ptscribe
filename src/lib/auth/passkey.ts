/**
 * Passkey helpers shared by the sign-in page, the magic-link callback, and the
 * Account → Security panel.
 *
 * The better-auth passkey client never throws for WebAuthn failures — it returns
 * `{ data: null, error: { code, message } }` with its own terse copy ("Auth
 * cancelled"). `passkeyError()` maps those codes to copy that tells a clinician
 * what to actually do next.
 */

import { detectBrowser, detectOS } from '@/lib/userAgent';

/** better-auth / SimpleWebAuthn error codes we have specific copy for. */
const SIGN_IN_MESSAGES: Record<string, string> = {
  AUTH_CANCELLED:
    'No passkey was found on this device, or the prompt was dismissed. If you’re new here or on a new device, email yourself a link instead — passkeys don’t transfer between devices automatically.',
  ERROR_CEREMONY_ABORTED:
    'Passkey sign-in was dismissed. Try again, or email yourself a link instead.',
  PASSKEY_NOT_FOUND:
    'That passkey isn’t registered to any PTScribe account. Email yourself a link to sign in, then add a passkey from Account → Security.',
  AUTHENTICATION_FAILED: 'We couldn’t verify that passkey. Try again, or email yourself a link.',
  CHALLENGE_NOT_FOUND: 'The sign-in attempt timed out. Try again.',
  UNABLE_TO_CREATE_SESSION: 'Signed in, but the session couldn’t be created. Please try again.',
};

const REGISTER_MESSAGES: Record<string, string> = {
  REGISTRATION_CANCELLED: 'Passkey setup was dismissed. You can add one any time from Account.',
  ERROR_CEREMONY_ABORTED: 'Passkey setup was dismissed. You can add one any time from Account.',
  PREVIOUSLY_REGISTERED: 'This device already has a passkey for your PTScribe account.',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED:
    'This device already has a passkey for your PTScribe account.',
  SESSION_REQUIRED: 'Your session expired. Sign in again, then add a passkey.',
  FAILED_TO_VERIFY_REGISTRATION: 'We couldn’t register that passkey. Please try again.',
  ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY:
    'Your browser blocked passkey setup. Check that you’re on a supported browser and try again.',
};

const FALLBACK: Record<'sign-in' | 'register', string> = {
  'sign-in': 'Passkey sign-in didn’t work. Try again, or email yourself a link instead.',
  register: 'Could not register a passkey on this device. Please try again.',
};

/** Shape returned by every better-auth passkey action's `error` field. */
export interface PasskeyErrorLike {
  code?: string;
  message?: string;
}

/**
 * Friendly copy for a passkey failure. Accepts the `error` object from a
 * better-auth action, or a thrown value (defensive — the client shouldn't throw).
 */
export function passkeyError(error: unknown, kind: 'sign-in' | 'register'): string {
  const table = kind === 'sign-in' ? SIGN_IN_MESSAGES : REGISTER_MESSAGES;
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as PasskeyErrorLike).code
      : undefined;
  if (code && table[code]) return table[code];
  // DOMException from a raw WebAuthn call — dismissal reads the same as "none found".
  if (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  ) {
    return kind === 'sign-in'
      ? SIGN_IN_MESSAGES.AUTH_CANCELLED
      : REGISTER_MESSAGES.REGISTRATION_CANCELLED;
  }
  return FALLBACK[kind];
}

/** True when this browser can do WebAuthn at all. */
export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

/**
 * True when the browser supports conditional mediation — the passkey autofill
 * dropdown on an `autocomplete="username webauthn"` field. Never throws.
 */
export async function isPasskeyAutofillAvailable(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  try {
    const check = window.PublicKeyCredential.isConditionalMediationAvailable;
    return typeof check === 'function' ? await check.call(window.PublicKeyCredential) : false;
  } catch {
    return false;
  }
}

/** Best-effort human label for the passkey created on this device. */
export function deriveDeviceName(userAgent: string = navigator.userAgent): string {
  const { name } = detectBrowser(userAgent);
  const os = detectOS(userAgent);
  return `${name === 'Unknown' ? 'Browser' : name} on ${os === 'Unknown' ? 'this device' : os}`;
}

/** Locale-formatted "added on" date for a passkey row. */
export function formatPasskeyDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
