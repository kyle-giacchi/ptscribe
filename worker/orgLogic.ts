// worker/orgLogic.ts
//
// Pure org logic with no DB or auth dependencies, so it can be unit-tested in
// isolation (jsdom/node) without a D1 binding. worker/org.ts re-uses these.

// Roles that may be assigned to an invited member. `owner` is intentionally
// excluded — there is exactly one owner (the org creator).
export const INVITABLE_ROLES = new Set(['admin', 'manager', 'standard', 'student']);

// Roles permitted to manage members and invites. Mirrors ORG_MANAGER_ROLES on
// the client (src/lib/auth/types.ts); enforced here is what actually counts.
export const MANAGER_ROLES = new Set(['owner', 'admin']);

export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Coerce an arbitrary role string to a safe invitable role. */
export function normalizeInviteRole(role: string | undefined): string {
  return role && INVITABLE_ROLES.has(role) ? role : 'standard';
}

/** Whether a role may manage members/invites. */
export function canManageMembers(role: string | null | undefined): boolean {
  return !!role && MANAGER_ROLES.has(role);
}

export interface InviteCandidate {
  id: string;
  orgId: string;
  role: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
}

/**
 * From a set of invites for one email, pick the one a sign-in should honor:
 * not accepted, not revoked, not expired — preferring the most recently created.
 * Returns null when none qualify.
 */
export function pickAcceptableInvite<T extends InviteCandidate>(
  invites: T[],
  now: number,
): T | null {
  const live = invites
    .filter((i) => i.acceptedAt === null && i.revokedAt === null && i.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
  return live[0] ?? null;
}
