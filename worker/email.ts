// worker/email.ts
//
// Transactional email via Resend (https://resend.com). A single `fetch` to the
// Resend API; no SDK. When RESEND_API_KEY is unset (local dev, or before the
// provider is configured) every send degrades to a console.log so auth still
// works end-to-end against the dev Worker — the link is printed to the console.
//
// Production prerequisites (see ADR-0004):
//   - A Resend account + a sending domain verified with DKIM/SPF DNS records.
//   - RESEND_API_KEY set as a Worker secret (`wrangler secret put RESEND_API_KEY`).
//   - EMAIL_FROM set to a from-address on that verified domain.
import type { Env } from './index';

const DEFAULT_FROM = 'PTScribe <login@ptscribe.app>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send one email through Resend, or log it when no API key is configured.
 * Never throws — callers invoke this inside ctx.waitUntil, where a rejection
 * would be an unhandled promise. Failures are logged for operators instead.
 */
async function sendEmail(env: Env, msg: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // Dev / unconfigured fallback. Print enough to complete the flow manually.
    // console.warn (not log) — the worker lint only permits warn/error.
    console.warn(
      `[email] (no RESEND_API_KEY) would send "${msg.subject}" to ${msg.to}\n${msg.text}`,
    );
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? DEFAULT_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });

    if (!res.ok) {
      // Keep the upstream detail in operator logs only; never surface it to the
      // client (this runs in waitUntil — there's no response to attach it to).
      const detail = await res.text().catch(() => '');
      console.error(`[email] Resend ${res.status}: ${detail.slice(0, 200) || res.statusText}`);
    }
  } catch (err) {
    console.error(`[email] Resend request failed: ${(err as Error).message || 'unknown'}`);
  }
}

/** Minimal HTML escape for values interpolated into email markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendMagicLinkEmail(env: Env, to: string, magicUrl: string): Promise<void> {
  const safeUrl = esc(magicUrl);
  await sendEmail(env, {
    to,
    subject: 'Your PTScribe sign-in link',
    text: [
      'Sign in to PTScribe by opening this link:',
      '',
      magicUrl,
      '',
      'This link expires in 10 minutes and can be used once.',
      "If you didn't request it, you can ignore this email.",
    ].join('\n'),
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 16px">Sign in to PTScribe</h1>
        <p style="font-size:14px;line-height:1.5;margin:0 0 20px">Click the button below to sign in. This link expires in 10 minutes and can be used once.</p>
        <p style="margin:0 0 24px">
          <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Sign in to PTScribe</a>
        </p>
        <p style="font-size:12px;line-height:1.5;color:#64748b;margin:0">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all">${safeUrl}</span></p>
        <p style="font-size:12px;color:#94a3b8;margin:20px 0 0">If you didn't request this, you can ignore this email.</p>
      </div>
    `.trim(),
  });
}

export async function sendOrgInviteEmail(
  env: Env,
  to: string,
  orgName: string,
  role: string,
): Promise<void> {
  const safeOrg = esc(orgName);
  const safeRole = esc(role);
  await sendEmail(env, {
    to,
    subject: `You've been invited to join ${orgName} on PTScribe`,
    text: [
      `You've been invited to join "${orgName}" on PTScribe as ${role}.`,
      '',
      'Sign in to PTScribe with this email address to accept the invitation.',
    ].join('\n'),
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 16px">Join ${safeOrg} on PTScribe</h1>
        <p style="font-size:14px;line-height:1.5;margin:0 0 20px">You've been invited to join <strong>${safeOrg}</strong> as <strong>${safeRole}</strong>.</p>
        <p style="font-size:14px;line-height:1.5;margin:0">Sign in to PTScribe with this email address to accept the invitation.</p>
      </div>
    `.trim(),
  });
}
