-- Organizations and invite token tables for the org signup flow.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]
-- Column names follow camelCase convention matching 0002_fix_column_casing.sql.

CREATE TABLE IF NOT EXISTS "organization" (
  "id"           TEXT    NOT NULL PRIMARY KEY,
  "name"         TEXT    NOT NULL,
  "contactEmail" TEXT    NOT NULL,
  "phone"        TEXT    NOT NULL,
  "createdAt"    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "org_invite_token" (
  "token"      TEXT    NOT NULL PRIMARY KEY,
  "orgName"    TEXT,
  "expiresAt"  INTEGER NOT NULL,
  "consumedAt" INTEGER
);
