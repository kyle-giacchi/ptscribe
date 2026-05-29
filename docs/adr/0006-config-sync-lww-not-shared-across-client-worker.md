---
status: accepted
---

# Config-sync last-write-wins logic is deliberately not shared between client and Worker

## Context

An architecture review flagged that config-sync reconciliation appears to be implemented twice —
`reconcile()` in `src/services/configSync.ts` and `shouldApplyIncoming()` in `worker/configLogic.ts` —
and proposed extracting a shared comparator so the two "can't drift."

They are not the same decision and must not be unified:

- **Client `reconcile(localUpdatedAt, server)`** is a _tri-state director_: `server > local → apply`,
  `server < local → push`, `equal → noop`. Equal versions are a **no-op** (nothing to send).
- **Worker `shouldApplyIncoming(incoming, stored)`** is a _binary write-guard_: accept iff
  `incoming >= stored`. Equal versions are **accepted** (idempotent re-push of the same state).

The equality handling diverges _on purpose_ — `noop` on the client vs `accept` on the Worker — so a
shared comparator would not even align the two; each side would still wrap it in its own decision.
The only genuinely common kernel is `sign(a − b)`, which is trivial and would have to cross the
`src/` ↔ `worker/` build boundary (separate tsconfigs/bundles) to share.

## Decision

Keep the two functions separate. The shared concept is "compare two version numbers," which is too
small to warrant a cross-boundary module, and the asymmetric equality semantics mean the functions
are answering different questions. The drift risk is bounded by each side's own unit tests
(`configSync` tests, `configLogic.test.ts`), not by code sharing.

## Consequences

The non-obvious bit a future reader should not "fix": the client treating equal versions as a no-op
while the Worker accepts them is intentional, not an inconsistency.
