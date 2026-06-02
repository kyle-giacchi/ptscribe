---
status: proposed
---

# Production use requires an account; note generation is the enforcing chokepoint

## Context

PTScribe has always been fully **anonymous and local-first**: `RequireAuth` exists in the
codebase but is wired to nothing, and the only first-run gate (`FirstRunGuard`) checks local
state (clinician name + disclosure acknowledgement), not a session. Auth (BetterAuth
passkey/magic-link) is optional today, used only for cross-device config sync and orgs. The
landing page and `HowItWorksModal` actively sell "lives in your browser / no account needed."

[ADR-0009](0009-byok-server-held-provider-keys.md) custodies each user's generation key
server-side and resolves it by **session**. That has an unavoidable consequence: to look up
_your_ key, the Worker must know _who you are_ — so generating a note now requires an
authenticated session. The question this ADR settles is how hard that gate is, and what happens
to data that already exists on a device with no account.

## Decision

**Make an account mandatory for non-demo use of the app**, with note generation as the point
where the requirement bites.

- **Hard gate.** Wire the long-dormant `RequireAuth` around the authenticated app routes (the
  `AppShell` tree). Not authenticated and not demo → redirect to `/login`. Demo
  (`isDemoMode()`) bypasses the gate entirely (it auto-unlocks and uses the shared key).
- **Gate order.** `RequireAuth` (session) → `FirstRunGuard` / `/setup` (local profile +
  disclosure) → app. Login is the outermost gate; the local profile step is unchanged behind it.
- **Generation enforcement is lazy.** A verified provider key is **not** required to finish
  onboarding — capture, curate, and manual note authoring stay available. The **Generate**
  action is the chokepoint: with no usable key (personal or org), it is blocked inline with a
  prompt to add one. This keeps the "explore first" path open while still enforcing BYOK exactly
  where spend happens.
- **Clinical data stays local-first.** This gate changes _access_ to the app, not where data
  lives — patients, sessions, notes, and audio remain on-device per the existing hard rules.

## Considered alternatives

- **Lazy gate only (no app-wide login wall).** Keep the app anonymous; require sign-in only at
  the Generate action. Lower friction and closer to local-first, but the owner chose the hard
  gate for stronger enforcement and a single, predictable identity for every session.
- **Account optional, key blocks only generation.** Same lazy shape with no onboarding nudge —
  rejected for the same reason.
- **Keep anonymous shared-key generation on production.** Rejected — it makes BYOK
  unenforceable (skip login → free shared-key generation) and re-bills PTScribe for real usage.

## Consequences

- **Existing on-device data must be reconciled with a new login.** With Profiles
  ([ADR-0007](0007-on-device-profiles-for-multi-user-isolation.md)) partitioning storage
  cryptographically per profile, a brand-new login
  must decide whether it **claims** the device's existing anonymous/profile data or starts
  **fresh**. This is the genuinely thorny, surprising part and the main reason this ADR exists;
  the chosen mapping (claim-on-login vs. fresh) must be specified before this ships, not
  retrofitted after the first "where did my patients go?" report.
- **Product copy is now wrong.** "No account needed" and the "~$5/yr" cloud-spend figure in the
  landing/`HowItWorksModal` no longer hold (account required; generation spend is the user's own
  provider bill). A deliberate copy rewrite is a hard dependency of launch.
- **Demo and Test User paths are unaffected** — both already bypass real auth and use the shared
  key; the gate explicitly excludes `isDemoMode()`.
- Auth moves from an optional convenience to a **launch-blocking dependency**: the pending Resend
  email secrets (magic link) and the org-invite flow are now on the critical path for any real
  user to do anything.
