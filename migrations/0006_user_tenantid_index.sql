-- Index user.tenantId. Supports handleListMembers (worker/org.ts) member
-- lookups and the tenancy filtering pattern; reconcileInvite runs on every
-- sign-in. Without this, WHERE tenantId = ? on "user" is a full table scan.
--
-- Additive only — safe to apply to the live remote D1 (no DROP, no data move),
-- and idempotent (IF NOT EXISTS). Unlike 0002, this needs no out-of-band care.
-- Column casing follows 0002_fix_column_casing.sql.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]
-- Rollback:   DROP INDEX IF EXISTS "user_tenantId_idx";

CREATE INDEX IF NOT EXISTS "user_tenantId_idx" ON "user"("tenantId");
