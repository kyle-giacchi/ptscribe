import type { PlanTier } from '@/types/plans';

/**
 * Org roles, mirroring the server (`worker/org.ts`). `owner` is the org creator;
 * `admin` can also manage members/invites. The rest are non-managing roles.
 */
export type OrgRole = 'owner' | 'admin' | 'manager' | 'standard' | 'student';

/** Roles permitted to manage org members and invites (client gating; enforced server-side too). */
export const ORG_MANAGER_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'admin']);

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  planTier: PlanTier;
  /**
   * Data-namespace tenant. Falls back to the user id for personal accounts so
   * local AppData stays partitioned. NOT a reliable signal of org membership —
   * use `orgId` for that.
   */
  tenantId: string;
  /** The org this user belongs to, or null for personal/demo accounts. */
  orgId: string | null;
  role: OrgRole;
  createdAt: number;
}
