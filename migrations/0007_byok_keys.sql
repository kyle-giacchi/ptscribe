-- BYOK (bring-your-own-key) provider keys for NOTE GENERATION (ADR-0009).
-- Each registered user, and optionally each org, custodies an encrypted provider
-- API key (Anthropic / OpenAI / Google) here. /api/generate resolves the active
-- key personal → org → block. The PTScribe shared key stays demo-only.
--
-- HARD BOUNDARY: like user_config (0005), these tables hold ONLY account-level
-- secrets — never patient/session/note/audio data. The plaintext key is NEVER
-- stored: only AES-256-GCM ciphertext + per-row iv (worker/keyCrypto.ts), plus a
-- non-secret last4 for display. Encryption protects against a D1 dump, not Worker
-- compromise (ADR-0009) — the master key lives in Secrets Store (KEY_ENC_MASTER).
--
-- Additive only — no DROP, no data move; idempotent (IF NOT EXISTS). Safe to apply
-- to live remote D1. Column casing follows 0002_fix_column_casing.sql.
-- Apply with: wrangler d1 migrations apply ptscribe-auth [--remote]
-- Rollback:   DROP TABLE IF EXISTS "user_api_keys"; DROP TABLE IF EXISTS "org_api_keys";

CREATE TABLE IF NOT EXISTS "user_api_keys" (
  "userId"      TEXT    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider"    TEXT    NOT NULL,   -- 'anthropic' | 'openai' | 'google'
  "ciphertext"  TEXT    NOT NULL,   -- base64 AES-256-GCM ciphertext of the API key
  "iv"          TEXT    NOT NULL,   -- base64 12-byte random IV, unique per write
  "last4"       TEXT    NOT NULL,   -- last 4 chars of the plaintext key, display only
  "status"      TEXT    NOT NULL,   -- 'unverified' | 'verified'
  "verifiedAt"  INTEGER,            -- ms timestamp of last successful live validation, or NULL
  "createdAt"   INTEGER NOT NULL,
  "updatedAt"   INTEGER NOT NULL,
  PRIMARY KEY ("userId", "provider")
);

CREATE TABLE IF NOT EXISTS "org_api_keys" (
  "orgId"       TEXT    NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "provider"    TEXT    NOT NULL,   -- 'anthropic' | 'openai' | 'google'
  "ciphertext"  TEXT    NOT NULL,
  "iv"          TEXT    NOT NULL,
  "last4"       TEXT    NOT NULL,
  "status"      TEXT    NOT NULL,   -- 'unverified' | 'verified'
  "verifiedAt"  INTEGER,
  "createdAt"   INTEGER NOT NULL,
  "updatedAt"   INTEGER NOT NULL,
  PRIMARY KEY ("orgId", "provider")
);
