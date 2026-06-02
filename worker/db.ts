// worker/db.ts
//
// Shared D1/Kysely plumbing. A single `AppDb` interface describes every table
// the worker touches (auth + org + config), and `makeDb` builds the typed
// Kysely instance. Routes import these instead of re-declaring partial table
// shapes, so the column types stay consistent across org.ts, caller.ts, and
// config.ts.

import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { Env } from './index';

export interface AppDb {
  org_invite_token: {
    token: string;
    orgName: string | null;
    expiresAt: number;
    consumedAt: number | null;
  };
  org_member_invite: {
    id: string;
    orgId: string;
    email: string;
    role: string;
    token: string;
    invitedBy: string;
    createdAt: number;
    expiresAt: number;
    acceptedAt: number | null;
    revokedAt: number | null;
  };
  organization: {
    id: string;
    name: string;
    contactEmail: string;
    phone: string;
    createdAt: number;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: number;
    image: string | null;
    planTier: string;
    tenantId: string | null;
    role: string;
    createdAt: number;
    updatedAt: number;
  };
  user_config: {
    userId: string;
    settings: string;
    clinician: string;
    templates: string;
    exercises: string;
    updatedAt: number;
  };
  org_config: {
    orgId: string;
    policy: string;
    templates: string;
    exercises: string;
    updatedAt: number;
  };
  // BYOK provider keys (ADR-0009). Plaintext is never stored — only AES-256-GCM
  // ciphertext + per-row iv (worker/keyCrypto.ts) plus a non-secret last4.
  user_api_keys: {
    userId: string;
    provider: string;
    ciphertext: string;
    iv: string;
    last4: string;
    status: string;
    verifiedAt: number | null;
    createdAt: number;
    updatedAt: number;
  };
  org_api_keys: {
    orgId: string;
    provider: string;
    ciphertext: string;
    iv: string;
    last4: string;
    status: string;
    verifiedAt: number | null;
    createdAt: number;
    updatedAt: number;
  };
}

export function makeDb(env: Env): Kysely<AppDb> {
  return new Kysely<AppDb>({ dialect: new D1Dialect({ database: env.DB }) });
}
