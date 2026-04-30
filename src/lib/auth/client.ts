import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [passkeyClient(), magicLinkClient()],
});

export type AuthSession = typeof authClient.$Infer.Session;
