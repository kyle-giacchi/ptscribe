-- Fix column casing: Better Auth uses camelCase column names by default.
-- Drops and recreates all auth tables with camelCase column names.

DROP TABLE IF EXISTS "passkey";
DROP TABLE IF EXISTS "verification";
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "user";

CREATE TABLE "user" (
  "id"            TEXT    NOT NULL PRIMARY KEY,
  "name"          TEXT    NOT NULL,
  "email"         TEXT    NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image"         TEXT,
  "planTier"      TEXT    NOT NULL DEFAULT 'personal-free',
  "tenantId"      TEXT,
  "role"          TEXT    NOT NULL DEFAULT 'owner',
  "createdAt"     INTEGER NOT NULL,
  "updatedAt"     INTEGER NOT NULL
);

CREATE TABLE "session" (
  "id"          TEXT    NOT NULL PRIMARY KEY,
  "expiresAt"   INTEGER NOT NULL,
  "token"       TEXT    NOT NULL UNIQUE,
  "createdAt"   INTEGER NOT NULL,
  "updatedAt"   INTEGER NOT NULL,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id"                     TEXT    NOT NULL PRIMARY KEY,
  "accountId"              TEXT    NOT NULL,
  "providerId"             TEXT    NOT NULL,
  "userId"                 TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"            TEXT,
  "refreshToken"           TEXT,
  "idToken"                TEXT,
  "accessTokenExpiresAt"   INTEGER,
  "refreshTokenExpiresAt"  INTEGER,
  "scope"                  TEXT,
  "password"               TEXT,
  "createdAt"              INTEGER NOT NULL,
  "updatedAt"              INTEGER NOT NULL
);

CREATE TABLE "verification" (
  "id"          TEXT    NOT NULL PRIMARY KEY,
  "identifier"  TEXT    NOT NULL,
  "value"       TEXT    NOT NULL,
  "expiresAt"   INTEGER NOT NULL,
  "createdAt"   INTEGER,
  "updatedAt"   INTEGER
);

CREATE TABLE "passkey" (
  "id"           TEXT    NOT NULL PRIMARY KEY,
  "name"         TEXT,
  "publicKey"    TEXT    NOT NULL,
  "userId"       TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "credentialId" TEXT    NOT NULL UNIQUE,
  "counter"      INTEGER NOT NULL DEFAULT 0,
  "deviceType"   TEXT    NOT NULL,
  "backedUp"     INTEGER NOT NULL DEFAULT 0,
  "transports"   TEXT,
  "createdAt"    INTEGER,
  "aaguid"       TEXT
);

CREATE INDEX IF NOT EXISTS "session_userId_idx"       ON "session"("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx"       ON "account"("userId");
CREATE INDEX IF NOT EXISTS "passkey_userId_idx"       ON "passkey"("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");
