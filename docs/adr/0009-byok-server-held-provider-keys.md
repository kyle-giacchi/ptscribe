---
status: proposed
---

# Bring-your-own-key: provider credentials are custodied server-side, multi-provider, with personal→org→block resolution

## Context

Until now, note generation ran on a single PTScribe-owned `ANTHROPIC_API_KEY`, held as a
Worker secret and injected server-side by `handleGenerate` (`worker/index.ts`). The browser
never saw a key; the only abuse control was the shared gate (`x-ptscribe-key`) plus a global
500/day spend cap. Two hard rules codified this: _"provider credentials are server-side
secrets the browser never sees"_ and _"the Worker never stores user data."_

We want each registered clinician (or their clinic) to pay for their own generation against
their own provider account — Anthropic, OpenAI, or Google — so PTScribe is not the bill-payer
for production usage. This is **BYOK**, and it forces a decision the existing rules don't cover:
where the user's credential lives, and who custodies it. BYOK applies to **note generation only**
— cloud transcription (Nova) stays on PTScribe's own account and is unaffected.

## Decision

**Custody the user's credential server-side**, encrypted at rest in D1, and resolve it per
authenticated request. Concretely:

- **Storage.** One encrypted row per `(userId, provider)` in D1 (and a parallel `(orgId,
provider)` surface for org keys). The row holds `{ ciphertext, iv, last4, status }` — never
  plaintext. The raw key is **never returned to any client**, including the user who set it;
  reads return only masked status (`set | unset`, `last4`, `verified | unverified`). The key is
  stored in a dedicated write-only store, **not** the `user_config` sync blob — that blob is
  echoed back to the browser by `GET /api/config/user` and rides last-write-wins sync, both of
  which would leak/scatter a secret.
- **Encryption.** AES-256-GCM via WebCrypto, random IV per row. The single master key is held in
  **Cloudflare Secrets Store**, statically bound to the Worker. (Secrets Store cannot hold the
  per-user keys themselves — it caps at 100 secrets/account with static, deploy-time bindings —
  but it is the right home for the _one_ account-level master key.)
- **Auth + routing.** `/api/generate` becomes **session-first**: a valid session → look up that
  caller's key and forward. The shared-key + gate path is **locked to the demo deployment**
  (`DEMO_MODE === 'true'`); a sessionless production generate is refused, so BYOK cannot be
  bypassed by simply not logging in.
- **Resolution order.** Personal key (for the active provider) → org key (for the active
  provider) → **blocked** with a prompt to add one. No silent fall-through to the shared key.
- **Multi-provider.** A Worker-side provider registry — `{ buildRequest, extractText,
modelAllowlist, validateKey, consoleUrl, keyHint }` — for Anthropic, OpenAI, and Google. The
  user's **active provider + model** is non-secret and rides config sync; only the keys are
  custodied.
- **Validation.** A key is **live-validated** against its provider before storage and shown as
  `verified`. A later runtime failure surfaces an actionable error but **never auto-invalidates**
  the stored key (avoids a transient 429/outage stranding a good key).

## Considered alternatives

- **Client-held key in the vault, forwarded per request.** Truest to the "server stores nothing"
  rule and avoids custody liability, but the key is per-device (re-prompt on every browser) — a
  poor fit for a _required_ credential and for the "set it once at sign-up" UX. Rejected for the
  multi-device friction.
- **Client-held + client-encrypted sync to D1.** Multi-device without server custody, but needs
  a client key-wrapping scheme keyed to something the user reliably has — and auth is
  passkey/magic-link, so there's no password to derive from. Rejected as disproportionate
  complexity.
- **Cloudflare Secrets Store for the per-user keys.** Rejected on hard limits: 100 secrets per
  account, one store per account, and static deploy-time bindings — there is no way to create and
  read an arbitrary per-user secret at request time.
- **Plaintext in D1.** Rejected: a single backup/dump would leak every user's live, billable key.
- **Keep the shared key for production too (BYOK optional).** Rejected by the owner — the goal is
  that PTScribe is not the bill-payer for real usage; the shared key is demo-only.

## Consequences

- **PTScribe is now a custodian of live billing credentials.** Encryption-at-rest protects
  against a D1 dump, **not** against a Worker compromise — the Worker must be able to decrypt to
  use the key. This is an accepted, irreversible-ish liability shift recorded here so it is a
  conscious posture, not an accident.
- `handleGenerate`'s deliberate **upstream-error masking** (which protects _our_ account text) now
  applies only to the demo/shared path. On the user-key path, provider auth/billing errors are
  surfaced to their owner — that is the user's own information.
- Adding a provider later is additive (a registry entry), but the **first** multi-provider build
  pays for three adapters, three model catalogs, three validators, and provider-specific
  system-prompt / prompt-cache handling (the current Anthropic `cache_control` ephemeral path is
  provider-specific).
- Requires a session on `/api/generate`, which is the seam that makes **mandatory authentication**
  necessary — see [ADR-0010](0010-mandatory-auth-gate.md).
