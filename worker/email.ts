// worker/email.ts
import type { Env } from './index';

export async function sendMagicLinkEmail(_env: Env, to: string, magicUrl: string): Promise<void> {
  console.log(`[auth] Magic link for ${to}: ${magicUrl}`);
}

export async function sendOrgInviteEmail(
  _env: Env,
  to: string,
  orgName: string,
  role: string,
): Promise<void> {
  console.log(`[org] Invite for ${to} to join "${orgName}" as ${role}`);
}
