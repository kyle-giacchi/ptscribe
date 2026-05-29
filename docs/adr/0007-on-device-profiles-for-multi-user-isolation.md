---
status: accepted
---

# On-device Profiles for multi-user isolation (login-optional, cryptographically separated)

## Context

PTScribe is local-first: clinical data lives encrypted on-device and BetterAuth login is
**optional** (it only enables non-clinical config sync). But storage was **single-namespace** —
one `ptnotes.appData`, one `ptnotes.vault`, one `ptnotes-audio` per browser profile — so two
people sharing a device, or even Demo vs Test User, shared the same clinical dataset. The vault
passphrase, not the login, was the only access boundary, and the `AuthContext` comment claiming
"personal accounts partition AppData by user id" was false (`tenantId` only partitions config sync
server-side). We needed real data separation when multiple people use one device.

## Decision

Introduce **Profiles**: cryptographically-isolated, separately-encrypted partitions of all
on-device data (own vault DEK/passphrase, own AppData/audio/audit). Login stays optional — a Profile
is selected/created, not gated by a cloud account.

- **Partition key by identity:** `local` (anonymous, the single default profile), `userId` (each
  authenticated BetterAuth account → its own profile), `demo` and `test-user` (two **separate**
  reserved profiles that share the `DEMO_USER` auth identity but never share storage).
- **Namespaced storage:** every key/store is suffixed `<base>:<profileId>`. Greenfield — **no
  migration** (no existing production users); stale un-suffixed keys are purged once. Audit log goes
  per-profile; the AppGate code stays device-global (demo-only friction layer); the config-sync gate
  is unchanged (only real `userId` profiles sync, already enforced).
- **No claim/merge (5a):** logging in selects/creates that account's profile; it never adopts the
  anonymous profile's data. Cross-profile data movement is only via the clinician's explicit portable
  backup export/import.
- **Lock-screen privacy:** the plaintext profile registry stores only non-PII labels
  (nickname/initials + color); name/email stay encrypted inside the vault. The default local profile
  is always shown; authenticated profiles are reached through login, not enumerated to a cold device.
- **Bulletproof teardown:** every profile transition (logout, switch, unlock-other) routes through a
  full `window.location.reload()`. A single global vault `BroadcastChannel` keeps **one active
  profile per browser at a time** (no concurrent demo+test tabs).
- **Device loss:** no remote wipe exists or can exist (server holds no clinical data). At-rest
  AES-GCM + tab-lifetime DEK eviction is the device-loss control, by design.

## Considered alternatives

- **Auth-as-identity (login mandatory, namespace by `userId`)** — rejected: breaks the local-first
  hard rule (app must be usable with no cloud account).
- **Claim-on-login / merge anonymous data into the account (5b)** — rejected by the owner in favor of
  the simpler, safer no-merge model; we never auto-combine two clinical datasets.
- **Per-profile `BroadcastChannel` scoping for concurrent tabs** — rejected: larger surface for no
  needed benefit; one-active-profile-per-browser is sufficient.
- **Logical (UI-filter) isolation under one shared vault DEK** — rejected: not real isolation;
  anyone who unlocks the device reads every profile.

## Consequences

- Demo and Test User stop bleeding into each other / into real data — the long-documented sharp edge
  in CONTEXT.md §Demo mode is resolved structurally, not by a badge.
- `VaultGate` must consume the active profile id to select its namespace (today it reads static
  keys), and `AuthContext`'s misleading "partition by user id" comment should be corrected — the
  partition is now real, via `profileId`, not `tenantId`.
- A permanent storage-key resolver keyed on profile id is introduced; `local` is no longer special
  (uniform suffixing) because there is no legacy data to preserve.
- CONTEXT.md gains a "Profiles and multi-user devices" section; the Demo mode / Test User sections
  were updated to describe separate profiles sharing one auth identity.
