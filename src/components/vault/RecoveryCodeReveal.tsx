import { useState } from 'react';
import { Copy, Download, KeyRound } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { downloadFile } from '@/utils/download';

/**
 * One-time reveal of a vault recovery code. The code is shown once and never
 * stored in plaintext, so the user must copy/save it and tick the acknowledgement
 * before continuing. Used at first-run vault setup and when regenerating from
 * Settings. See ADR-0003.
 */
export function RecoveryCodeReveal({
  code,
  onAcknowledge,
  confirmLabel = 'I’ve saved my recovery code',
}: {
  code: string;
  onAcknowledge: () => void;
  confirmLabel?: string;
}) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard may be unavailable — the download fallback still works */
      },
    );
  }

  function handleDownload() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      `ptscribe-recovery-code-${stamp}.txt`,
      `PTScribe vault recovery code\n\n${code}\n\n` +
        'Keep this somewhere safe and private. Anyone with this code AND a backup ' +
        'file of your data can decrypt it. You can use it to unlock this device or ' +
        'restore a backup if you forget your passphrase.\n',
      'text/plain',
    );
  }

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={16} strokeWidth={1.75} style={{ color: 'var(--color-pt-accent-fg)' }} />
          <Eyebrow>Recovery code</Eyebrow>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
          This is the <strong>only</strong> way back into your data if you forget your passphrase.
          We can’t recover it for you — save it somewhere safe now. It won’t be shown again.
        </p>
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 15,
            letterSpacing: '0.04em',
            wordBreak: 'break-all',
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--color-pt-bg)',
            border: '1px solid var(--color-pt-border)',
            color: 'var(--color-pt-text)',
            userSelect: 'all',
          }}
        >
          {code}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <PtButton
            variant="ghost"
            iconLeft={<Copy size={14} strokeWidth={2} />}
            onClick={handleCopy}
          >
            {copied ? 'Copied' : 'Copy'}
          </PtButton>
          <PtButton
            variant="ghost"
            iconLeft={<Download size={14} strokeWidth={2} />}
            onClick={handleDownload}
          >
            Download
          </PtButton>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            fontSize: 13,
            color: 'var(--color-pt-text-1)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>{confirmLabel}</span>
        </label>
        <PtButton variant="primary" disabled={!acked} onClick={onAcknowledge}>
          Continue
        </PtButton>
      </div>
    </SurfaceCard>
  );
}
