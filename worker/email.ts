import type { Env } from './index';

/**
 * Send a magic link email. MailChannels integration is deferred — logs the
 * URL to the Worker console so you can click it manually during development.
 */
export async function sendMagicLinkEmail(_env: Env, to: string, magicUrl: string): Promise<void> {
  console.log(`[auth] Magic link for ${to}: ${magicUrl}`);
}
