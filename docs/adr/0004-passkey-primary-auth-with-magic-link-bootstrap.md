---
status: accepted
---

# Passkey-primary auth with a magic-link bootstrap (Resend)

## Context

Auth (BetterAuth on the Cloudflare Worker, D1-backed) currently exposes two sign-in paths in
`src/pages/Login.tsx`: `signIn.passkey()` and `signIn.magicLink()`. Two things are broken:

1. **There is no passkey *registration* anywhere.** The codebase calls `authClient.signIn.passkey()`
   but never `authClient.passkey.addPasskey()`. Since a WebAuthn credential can only be attached to
   an *already-authenticated* account, sign-in-with-passkey can never succeed — there is no path that
   creates the credential in the first place.
2. **Magic-link email is a `console.log` stub** (`worker/email.ts` `sendMagicLinkEmail`). The link is
   only ever printed to the Worker console, so no real user can complete a magic-link login either.

The net effect: outside demo mode (`VITE_DEMO_MODE` default ON, which auto-unlocks), **no account can
be bootstrapped at all.** We want passkey to be the everyday login, but WebAuthn fundamentally cannot
be the *first* factor for a brand-new account — a passkey attaches to an account that already exists.

## Decision

Adopt a **two-tier auth model**:

- **Bootstrap (first login / new device with no local passkey): magic-link email**, sent for real via
  **Resend** (free tier) from the Worker. `worker/email.ts` `sendMagicLinkEmail` becomes a single
  `fetch` to the Resend API using a `RESEND_API_KEY` Worker secret and a verified sending domain
  (DKIM/SPF DNS records). This is the only way to authenticate when no passkey exists yet.
- **Primary (every login thereafter): passkey.** After bootstrap, the user is prompted to register a
  passkey via `authClient.passkey.addPasskey()`. Account → Security gains a passkey panel that lists
  registered credentials with device label + added-date and a Remove action, plus "+ Add a passkey".
  `Login.tsx` presents "Sign in with passkey" as the primary CTA, with magic-link demoted to a
  secondary "Email me a link instead" affordance.
- **Honest fallback copy.** Replace the current misleading passkey-error text ("Try again or use a
  magic link") and `AuthCallback.tsx`'s blanket `?error=invalid-link` (which mislabels network
  failures as expired links) with copy that distinguishes "no passkey on this device yet" from a real
  failure.

## Considered alternatives

- **Passkey-only (no email at all)** — rejected. Impossible: WebAuthn cannot create the first account
  credential. Something non-passkey must bootstrap.
- **Email + password as the bootstrap credential** — rejected. Reintroduces the password we were
  avoiding *and* its reset flow, which itself needs email. Email is on the critical path either way,
  so magic-link bootstrap is strictly less surface than password + reset.
- **MailChannels for sending** — rejected. MailChannels ended its free Cloudflare Workers tier in
  mid-2024; it now requires a paid account plus DKIM domain setup. Resend's free tier (~3k/mo) reaches
  parity on the DNS/DKIM requirement at zero cost, with a single-`fetch` API.

## Consequences

- **Email is now a hard production dependency.** A Resend account, a verified sending domain, and the
  `RESEND_API_KEY` secret (on `cloudflare-deployment` wrangler vars) must exist before auth is enabled
  for real users. The `console.log` stub stays for local dev.
- **New-device flow always starts with email**, even for an existing account, because passkeys are
  per-authenticator and don't roam unless synced by the platform (iCloud Keychain / Google Password
  Manager). This is expected, not a bug — surface it in copy so a returning clinician on a new laptop
  isn't confused by being asked to email themselves.
- **CLAUDE.md "magic-link email is a stub — wire a real provider before enabling auth" is resolved by
  this work**; update that note when `sendMagicLinkEmail` ships.
- Demo mode is unaffected (auth is bypassed entirely).
- `sendOrgInviteEmail` (also a stub) should be migrated to the same Resend path opportunistically while
  the sender plumbing is being built.
