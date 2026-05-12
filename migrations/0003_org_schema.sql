-- Organizations and invite token tables for the org signup flow.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]

CREATE TABLE IF NOT EXISTS "organization" (
  "id"            TEXT    NOT NULL PRIMARY KEY,
  "name"          TEXT    NOT NULL,
  "contact_email" TEXT    NOT NULL,
  "phone"         TEXT    NOT NULL,
  "created_at"    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "org_invite_token" (
  "token"       TEXT    NOT NULL PRIMARY KEY,
  "org_name"    TEXT,
  "expires_at"  INTEGER NOT NULL,
  "consumed_at" INTEGER
);

CREATE INDEX IF NOT EXISTS "org_invite_token_token_idx" ON "org_invite_token"("token");
