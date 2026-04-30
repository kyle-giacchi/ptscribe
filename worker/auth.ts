import { betterAuth } from 'better-auth';
import { kyselyAdapter } from '@better-auth/kysely-adapter';
import { passkey } from '@better-auth/passkey';
import { magicLink } from 'better-auth/plugins/magic-link';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import { sendMagicLinkEmail } from './email';
import type { Env } from './index';

export function createAuth(env: Env, ctx: ExecutionContext) {
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is not configured');
  const db = new Kysely({ dialect: new D1Dialect({ database: env.DB }) });
  const baseURL = env.AUTH_BASE_URL ?? 'https://ptscribe.app';
  const isSecure = baseURL.startsWith('https://');
  const rpID = new URL(baseURL).hostname;

  return betterAuth({
    secret: env.AUTH_SECRET,
    baseURL,
    basePath: '/api/auth',
    database: kyselyAdapter(db, { type: 'sqlite' }),
    trustedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : [baseURL, 'http://localhost:8080', 'http://localhost:8787'],
    advanced: {
      useSecureCookies: isSecure,
    },
    user: {
      additionalFields: {
        planTier: { type: 'string', defaultValue: 'personal-free', input: false },
        tenantId: { type: 'string', required: false, input: false },
        role: { type: 'string', defaultValue: 'owner', input: false },
      },
    },
    plugins: [
      passkey({
        rpID,
        rpName: 'PTScribe',
        origin: baseURL,
      }),
      magicLink({
        expiresIn: 600,
        sendMagicLink: async ({ email, url: magicUrl }) => {
          ctx.waitUntil(sendMagicLinkEmail(env, email, magicUrl));
        },
      }),
    ],
  });
}
