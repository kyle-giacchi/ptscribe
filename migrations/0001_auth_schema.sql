-- Better Auth schema for PTScribe (SQLite / Cloudflare D1)
-- Generated for better-auth@1.6.x with passkey and magic-link plugins
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]

CREATE TABLE IF NOT EXISTS "user" (
  "id"             TEXT    NOT NULL PRIMARY KEY,
  "name"           TEXT    NOT NULL,
  "email"          TEXT    NOT NULL UNIQUE,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image"          TEXT,
  "plan_tier"      TEXT    NOT NULL DEFAULT 'personal-free',
  "tenant_id"      TEXT,
  "role"           TEXT    NOT NULL DEFAULT 'owner',
  "created_at"     INTEGER NOT NULL,
  "updated_at"     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT    NOT NULL PRIMARY KEY,
  "expires_at"  INTEGER NOT NULL,
  "token"       TEXT    NOT NULL UNIQUE,
  "created_at"  INTEGER NOT NULL,
  "updated_at"  INTEGER NOT NULL,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "user_id"     TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                        TEXT    NOT NULL PRIMARY KEY,
  "account_id"                TEXT    NOT NULL,
  "provider_id"               TEXT    NOT NULL,
  "user_id"                   TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token"              TEXT,
  "refresh_token"             TEXT,
  "id_token"                  TEXT,
  "access_token_expires_at"   INTEGER,
  "refresh_token_expires_at"  INTEGER,
  "scope"                     TEXT,
  "password"                  TEXT,
  "created_at"                INTEGER NOT NULL,
  "updated_at"                INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"          TEXT    NOT NULL PRIMARY KEY,
  "identifier"  TEXT    NOT NULL,
  "value"       TEXT    NOT NULL,
  "expires_at"  INTEGER NOT NULL,
  "created_at"  INTEGER,
  "updated_at"  INTEGER
);

CREATE TABLE IF NOT EXISTS "passkey" (
  "id"           TEXT    NOT NULL PRIMARY KEY,
  "name"         TEXT,
  "public_key"   TEXT    NOT NULL,
  "user_id"      TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "credential_id" TEXT   NOT NULL UNIQUE,
  "counter"      INTEGER NOT NULL DEFAULT 0,
  "device_type"  TEXT    NOT NULL,
  "backed_up"    INTEGER NOT NULL DEFAULT 0,
  "transports"   TEXT,
  "created_at"   INTEGER,
  "aaguid"       TEXT
);

CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session"("user_id");
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account"("user_id");
CREATE INDEX IF NOT EXISTS "passkey_user_id_idx" ON "passkey"("user_id");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");
