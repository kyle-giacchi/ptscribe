---
status: accepted
---

# Recovery code + portable backup envelope (client-side, no cloud)

## Context

The vault is unrecoverable by design: the DEK is wrapped only by a passphrase-derived
KEK, the key is evicted on tab close, and CONTEXT.md/invariants.md state plainly "there
is no passphrase recovery." This makes every forgotten passphrase a permanent loss of all
clinical data. Separately, the existing encrypted backup (`BackupService` v1) is **not
portable across devices**: `exportBackup` encrypts under the source device's random DEK and
`importBackup` decrypts with the _currently unlocked_ vault's DEK, so a restore only succeeds
on the same vault — a fresh device has a different DEK and fails with "wrong passphrase" even
when the passphrase is correct. The v1 file comment ("useless without the passphrase") is
misleading; it is useless without the same _key_.

## Decision

Add an **opt-out-proof recovery code** and a **self-contained, portable backup envelope**,
both entirely client-side. No server, no cloud storage of clinical data — the
"clinical data never leaves the device" hard rule and marketing promise stay intact. The
**backup file is the cross-device transport** (the clinician carries it via Drive/USB/etc.).

- **Recovery code** — a high-entropy code generated at first-run vault setup (shown once,
  mandatory "I've saved it" acknowledgement; regenerable from Settings, which invalidates the
  old one). A recovery-derived KEK wraps the **same DEK** as the passphrase, stored as a
  second wrapped-DEK envelope locally. Because it wraps the DEK (not the passphrase), the
  recovery code survives passphrase changes.
- **Portable backup (v2 envelope)** — `{ ciphertext, wrappedDek_passphrase,
wrappedDek_recoveryCode, salts, ivs }`. AppData is encrypted under the DEK; the DEK is
  wrapped by both the passphrase-KEK and the recovery-KEK. Restore on **any** device by
  entering **either the passphrase or the recovery code** → derive KEK → unwrap DEK →
  decrypt. v1 (same-device) files remain importable for backwards compatibility. Audio
  (IndexedDB blobs) remains excluded from backups, as today.

## Considered alternatives

- **Cloud backup on Cloudflare (zero-knowledge or otherwise)** — rejected. Even E2E-encrypted,
  holding PHI ciphertext server-side breaks the "never leaves the device" hard rule + landing/
  CompareModal/architecture-narrative promise, and likely triggers HIPAA Business-Associate /
  BAA obligations. Explicitly chosen _against_ in favour of client-side file portability.
- **Backup encrypted under a separate export password** — rejected; recovery would be only as
  fresh as the last export and adds a second daily-unrelated secret without the in-place
  same-device recovery the code path gives.
- **Confirm-step + warnings only (no recovery path)** — rejected as insufficient; the user
  wants a forgotten passphrase to be non-terminal.

## Consequences

- Reverses the documented invariant. **CONTEXT.md §"Vault and the recording workflow"
  (the "there is no passphrase recovery" line) and docs/invariants.md (vault section, "There
  is no recovery") must be updated when this ships.**
- New loss vector / security surface: anyone holding the **backup file + recovery code** can
  decrypt the data offline. The recovery code must therefore be high-entropy (≥128 bits) and
  derived through the same memory-hard KDF (Argon2id `deriveKek`) as the passphrase.
- Demo mode (vault auto-unlocked with a hardcoded passphrase) does not surface the recovery
  code flow.
