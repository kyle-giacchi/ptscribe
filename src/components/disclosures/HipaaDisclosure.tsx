import { ShieldAlert } from 'lucide-react';

/**
 * Canonical HIPAA / data-handling disclosure surface used in Setup, Settings,
 * and the Landing page. Centralizing the wording avoids drift between the
 * three places clinicians read it.
 */

export type HipaaDisclosureVariant = 'full' | 'compact';

export function HipaaDisclosure({
  variant = 'full',
  className,
}: {
  variant?: HipaaDisclosureVariant;
  className?: string;
}) {
  if (variant === 'compact') {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          gap: 8,
          padding: 10,
          borderRadius: 10,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface-mut)',
          fontSize: 12,
          color: 'var(--color-pt-text-2)',
          lineHeight: 1.5,
        }}
      >
        <ShieldAlert
          size={14}
          strokeWidth={1.75}
          style={{ marginTop: 2, flexShrink: 0, color: 'var(--color-pt-amber)' }}
        />
        <p style={{ margin: 0 }}>
          <strong style={{ color: 'var(--color-pt-text)' }}>
            PTScribe is not HIPAA-certified.
          </strong>{' '}
          Patient data is encrypted on this device, but audio and transcripts are sent over TLS to
          Cloudflare Workers AI and Anthropic for transcription and note generation. Treat
          everything you record as PHI in transit and confirm BAAs with both providers before using
          real patient data.
        </p>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
        fontSize: 12.5,
        color: 'var(--color-pt-text-2)',
        lineHeight: 1.55,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <ShieldAlert
          size={16}
          strokeWidth={1.75}
          style={{ flexShrink: 0, color: 'var(--color-pt-amber)' }}
        />
        <strong style={{ color: 'var(--color-pt-text)', fontSize: 13 }}>
          Privacy &amp; HIPAA disclosure
        </strong>
      </div>

      <p style={{ margin: 0 }}>
        <strong style={{ color: 'var(--color-pt-text)' }}>What stays on this device.</strong>{' '}
        Patients, sessions, notes, templates, and exercises are stored in this browser using
        localStorage and IndexedDB. With a vault passphrase set, both stores are encrypted at rest
        with AES-GCM-256; the key is derived from your passphrase via Argon2id and lives only in
        this browser tab.
      </p>

      <p style={{ margin: 0 }}>
        <strong style={{ color: 'var(--color-pt-text)' }}>What leaves the device.</strong>{' '}
        Transcription and note generation are proxied through a Cloudflare Worker we operate. Audio
        is forwarded to Cloudflare Workers AI (Deepgram Nova-3) and transcripts are forwarded to
        Anthropic (Claude). Both legs travel over TLS and reach providers using server-side
        credentials the browser never sees.
      </p>

      <p style={{ margin: 0 }}>
        <strong style={{ color: 'var(--color-pt-text)' }}>What we are not.</strong> PTScribe has not
        been independently audited and is not HIPAA-certified software. There is no signed BAA in
        place between PTScribe and the AI providers on your behalf — that arrangement is yours to
        confirm directly with Cloudflare and Anthropic before recording any real patient data.
      </p>

      <p style={{ margin: 0 }}>
        <strong style={{ color: 'var(--color-pt-text)' }}>Your responsibilities.</strong> Obtain
        explicit verbal or written consent from each patient before recording. If you lose your
        passphrase, the encrypted local data cannot be recovered — there is no reset path.
      </p>
    </div>
  );
}
