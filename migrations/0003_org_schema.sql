-- Organizations and invite token tables for the org signup flow.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]

CREATE TABLE IF NOT EXISTS "organization" (
  "id"           TEXT    NOT NULL PRIMARY KEY,
  "name"         TEXT    NOT NULL,
  "contactEmail" TEXT    NOT NULL,
  "phone"        TEXT    NOT NULL,
  "createdAt"    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "orgInviteToken" (
  "token"       TEXT    NOT NULL PRIMARY KEY,
  "orgName"     TEXT,
  "expiresAt"   INTEGER NOT NULL,
  "consumedAt"  INTEGER
);

CREATE INDEX IF NOT EXISTS "orgInviteToken_token_idx" ON "orgInviteToken"("token");
