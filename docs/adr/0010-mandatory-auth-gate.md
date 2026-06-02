---
status: accepted
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

- **Anonymous-data mapping: a new login starts _fresh_ — it never claims the `local` profile
  (decided 2026-06-02).** With Profiles
  ([ADR-0007](0007-on-device-profiles-for-multi-user-isolation.md)) partitioning storage
  cryptographically per profile, a login resolves to its **own `userId` profile** and does **not**
  adopt the anonymous `local` profile's data. This keeps ADR-0007's already-decided no-claim/no-merge
  model (5a) intact rather than reversing it. The choice is safe — not merely tolerable — _because_
  this ADR picked the **hard** gate: a non-demo user must authenticate **before** reaching
  `FirstRunGuard`, `/setup`, or any data-creating route, so they land directly in their `userId`
  profile and create data there. The `local` profile is therefore **structurally never populated in
  production** (demo/test use the `demo`/`test-user` profiles, which bypass the gate; greenfield means
  no login-optional build ever shipped to real users). The dreaded "where did my patients go?"
  outcome is a property of a _lazy_ gate — which this ADR rejected — not of the hard gate. The only
  residual `local` data is a developer's own pre-gate scratch data, recoverable (if ever needed) via
  ADR-0007's explicit backup export/import, not via auto-claim. **Implementation:** the session check
  must run ahead of the profile commit so an anonymous non-demo visit is redirected to `/login`
  before `ProfileResolver` ever commits `local` (i.e. `RequireAuth` gates above the profile/vault
  mount, not just the inner routes); a test pins "login → `userId` profile, no adoption of `local`."
  Reopen this decision only if a **login-optional public beta** is ever shipped before the hard gate
  — that is the sole scenario in which real users could accumulate `local` data worth claiming.
- **Product copy is now wrong.** "No account needed" and the "~$5/yr" cloud-spend figure in the
  landing/`HowItWorksModal` no longer hold (account required; generation spend is the user's own
  provider bill). A deliberate copy rewrite is a hard dependency of launch.
- **Demo and Test User paths are unaffected** — both already bypass real auth and use the shared
  key; the gate explicitly excludes `isDemoMode()`.
- Auth moves from an optional convenience to a **launch-blocking dependency**: the pending Resend
  email secrets (magic link) and the org-invite flow are now on the critical path for any real
  user to do anything.
