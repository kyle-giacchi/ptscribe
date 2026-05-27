-- Per-member invitations to an existing organization.
-- Distinct from `org_invite_token` (0003), which is a one-shot gate for org *creation*.
-- A row here records that `email` was invited to join `orgId` as `role`. When that
-- email next signs in, the auth layer reconciles the pending invite and joins them.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]
-- Column names follow the camelCase convention from 0002_fix_column_casing.sql.

CREATE TABLE IF NOT EXISTS "org_member_invite" (
  "id"         TEXT    NOT NULL PRIMARY KEY,
  "orgId"      TEXT    NOT NULL,
  "email"      TEXT    NOT NULL,          -- normalized to lowercase on insert
  "role"       TEXT    NOT NULL,
  "token"      TEXT    NOT NULL UNIQUE,
  "invitedBy"  TEXT    NOT NULL,          -- user id of the inviting owner/admin
  "createdAt"  INTEGER NOT NULL,
  "expiresAt"  INTEGER NOT NULL,
  "acceptedAt" INTEGER,                   -- set when the invited user joins
  "revokedAt"  INTEGER                    -- set when an owner/admin revokes
);

-- Members list + invite management query by org.
CREATE INDEX IF NOT EXISTS "org_member_invite_orgId_idx" ON "org_member_invite"("orgId");
-- Sign-in reconciliation looks up pending invites by email.
CREATE INDEX IF NOT EXISTS "org_member_invite_email_idx" ON "org_member_invite"("email");
