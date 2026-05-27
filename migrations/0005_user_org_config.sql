-- Per-user and per-org NON-CLINICAL config, persisted so registered users keep
-- their settings/profile/custom content across devices, and orgs carry policy +
-- a shared template/exercise library.
--
-- HARD BOUNDARY: patient data (patients/sessions/notes/plans) and audio NEVER
-- reach D1. These tables hold only account-level config. The client projection
-- (src/services/configSync.ts) is the single place the sync payload is built;
-- the worker additionally rejects any blob containing forbidden top-level keys.
--
-- The demo user is fully isolated and never reads or writes these tables.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]
-- Column names follow the camelCase convention from 0002_fix_column_casing.sql.

CREATE TABLE IF NOT EXISTS "user_config" (
  "userId"     TEXT    NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "settings"   TEXT    NOT NULL,   -- JSON: settings subtree
  "clinician"  TEXT    NOT NULL,   -- JSON: clinician profile
  "templates"  TEXT    NOT NULL,   -- JSON: custom (non-builtin) templates array
  "exercises"  TEXT    NOT NULL,   -- JSON: custom (non-builtin) exercises array
  "updatedAt"  INTEGER NOT NULL    -- client-supplied config version (last-write-wins)
);

CREATE TABLE IF NOT EXISTS "org_config" (
  "orgId"      TEXT    NOT NULL PRIMARY KEY REFERENCES "organization"("id") ON DELETE CASCADE,
  "policy"     TEXT    NOT NULL,   -- JSON: org policy blob
  "templates"  TEXT    NOT NULL,   -- JSON: shared templates array
  "exercises"  TEXT    NOT NULL,   -- JSON: shared exercises array
  "updatedAt"  INTEGER NOT NULL    -- last-write-wins
);
