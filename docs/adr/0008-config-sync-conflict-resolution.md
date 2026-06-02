---
status: accepted
---

# Config-sync prompts the user on a genuine conflict instead of silently applying last-write-wins

## Context

[ADR-0006](0006-config-sync-lww-not-shared-across-client-worker.md) established the client
`reconcile(localUpdatedAt, server)` as a tri-state director — `apply` (server newer), `push` (local
newer), `noop` (equal). The `apply` branch overwrites the local non-clinical config (settings,
clinician profile, custom templates/exercises) with the server's, with **no UI signal**. Because
`localUpdatedAt` is written only on a successful _push_ (it tracks "last sync", not "last local
edit"), a true two-device divergence resolves silently in favour of whichever side has the larger
timestamp — the losing device's unpushed edits vanish without the clinician ever knowing.

This is acceptable for genuinely stale data but not for a real conflict, where _both_ sides changed
since their last common sync. The owner wants the clinician to decide which version survives.

Note: this is dormant in production today — config sync runs only for authenticated `userId`
profiles, and auth is not yet live. The decision is being recorded before auth ships so the launch
includes it rather than retrofitting after the first lost-settings report.

## Decision

Extend the client reconciler from three states to four. `apply` / `push` / `noop` are unchanged; add
a **`conflict`** state for genuine two-sided divergence, surfaced to the clinician as a blocking
choice.

- **Detect a genuine conflict** with a 3-way comparison against the last-synced baseline already in
  the sync record (`configSync.ts`): `localChanged = currentLocalHash !== rec.hash` **and**
  `serverChanged = server.updatedAt !== rec.serverUpdatedAt`. Only when **both** are true is it a
  conflict. One-sided divergence stays a clean fast-forward (`apply` or `push`) with no prompt — so
  the prompt is rare and therefore taken seriously rather than click-through dismissed.
- **Whole-config, all-or-nothing choice.** The clinician picks "Keep this device" or "Use cloud" for
  the entire non-clinical config bundle. No per-slice or per-item merge.
- **The choice is final.** No snapshot, no undo of the discarded side.
- **Wiring:** the pull effect ends in a `needs-resolution` state (holding both candidate
  projections) instead of auto-applying; a small modal consumes a conflict flag exposed by
  `ConfigSyncProvider` and applies the winner through the existing slice mutators. The demo /
  test-user / unauthenticated **isolation gate** and the **single write path** are unchanged — the
  only new behaviour is that a pull may now pause for input instead of always applying.

## Considered alternatives

- **Keep silent LWW (status quo).** Rejected by the owner: a one-click-equivalent silent discard of
  the clinician's own template/settings edits is the exact data-loss surprise we want to remove.
- **Prompt on every multi-device divergence**, not just genuine conflicts. Rejected: a "Local or
  Cloud?" wall on every second-device open — even when only one side changed — trains the user to
  dismiss it blindly, silently reintroducing the loss.
- **Per-slice or per-item conflict resolution.** Rejected for v1: per-slice avoids false either/or
  but adds UI; per-item needs a 3-way item diff with rename/delete ambiguity. Config conflicts are
  rare and low-stakes; the extra machinery isn't justified yet.
- **Keep a one-shot recoverable snapshot of the discarded version.** Rejected by the owner in favour
  of a final choice — simpler, no extra storage or restore UI.

## Consequences

- The `reconcile()` contract gains a fourth return state; `configLogic.ts` on the Worker is
  unaffected (it remains the binary write-guard from ADR-0006 — the asymmetry that ADR documents
  still holds).
- A pull is no longer guaranteed to be fire-and-forget; callers must tolerate a `needs-resolution`
  pause. This is the one place client config sync becomes interactive.
- All-or-nothing + final means a mistaken pick discards the loser's edits across **all** config
  categories with no recovery — an accepted sharp edge, recorded here so it isn't "fixed" into a
  snapshot/undo system without revisiting this trade-off.
