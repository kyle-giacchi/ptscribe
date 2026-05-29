---
status: accepted
---

# Curate notification & error surfaces: five surfaces, one event one surface

## Context

The Curate flow (the Review tab of `Session.tsx`) accreted four overlapping ways to tell the
clinician something happened — a page-level `ErrorBanner` (generic `error` string), inline
`AiCallError` panels, `sonner` toasts, and the global Alerts bell (`NotificationsProvider`).
Nothing governed which surface a given message used, so the same failure could plausibly land in
several of them, and some messages contradicted `CONTEXT.md` (e.g. "no speech detected" went to the
bell, though the glossary specifies an inline Curate banner). The "never silent" contract was being
satisfied loudly and inconsistently.

## Decision

We adopt **five canonical surfaces** — Toast, Inline alert, Blocking dialog, Alerts bell, Page
banner — routed by two questions: _did the clinician just trigger it, in their current focus?_ and
_does it require an action to move forward?_ (See the **Notification and error surfaces** entry in
`CONTEXT.md` for the per-surface definitions.)

Three rules give the model teeth:

1. **One event = one surface.** The same event is never announced twice. The redundant
   `toast.error` that accompanied inline AI-call errors is removed.
2. **The Page banner is reserved for session-wide persistence/save failures**, not artifact-tied
   errors. An unclassified _generation_ failure moves to the Note's Inline alert via a generic
   fallback; the banner keeps only the storage/save-failure role it already serves.
3. **The Alerts bell is cross-session / ambient only.** A failure specific to the artifact or
   affordance the clinician is working on is an Inline alert, never a bell entry.

Because an Inline alert is the source of truth but its host can be hidden, off-screen cases get a
**pointer**: scrolled-but-mounted → a one-time toast that scrolls it into view; collapsed/unmounted
host → a **persistent error badge** on the collapsed-transcript tab plus a one-time toast. A
transient toast is never the only indicator of a persistent error.

## Considered options

- **Retire the page banner entirely** (collapse to four surfaces). Rejected: a persistent,
  session-wide indicator for save failures is genuinely distinct from artifact-tied inline alerts,
  and a transient toast is too weak for "your edits may not be saved."
- **Leave background/no-speech/playback failures in the Alerts bell.** Rejected for the artifact-
  specific ones: they are most useful anchored to the surface they degrade, and routing them to the
  bell contradicted `CONTEXT.md`. The bell is kept strictly for ambient, cross-session events.
- **Keep inline + toast double-surfacing for attention.** Rejected: the toast vanishes before the
  clinician can act on the inline Retry, and duplication erodes the taxonomy.

## Consequences

- Existing call-sites must be re-routed to match (tracked in
  `.scratch/curate-notifications/issues/01-route-events-to-canonical-surfaces.md`).
- New UI is needed: a generic fallback for `AiCallError`, a persistent error badge on the
  collapsed-transcript tab, and an informational inline notice on the audio player / ClipsDrawer.
- The `NotificationsProvider` bell's scope narrows; artifact-specific `addNotification` calls move
  to inline surfaces.
