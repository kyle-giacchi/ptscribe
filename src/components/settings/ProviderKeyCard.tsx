import { useState } from 'react';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { TextInput } from '@/components/ui/Field';
import type { ProviderDescriptor } from '@/services/ai/providerCatalog';
import {
  putUserKey,
  deleteUserKey,
  verifyUserKey,
  type KeyStatus,
  type KeyMutationResult,
} from '@/services/ai/keysClient';

interface Props {
  descriptor: ProviderDescriptor;
  status: KeyStatus | undefined;
  onStatusChange: (status: KeyStatus) => void;
}

type Busy = 'saving' | 'verifying' | 'removing' | null;
type Feedback = { kind: 'ok' | 'err'; msg: string } | null;

/** Map a Worker key-error code to actionable copy (the raw provider text never leaks). */
function reasonFor(code: string, fallback: string): string {
  switch (code) {
    case 'KEY_REJECTED':
      return 'The provider rejected this key. Check it has billing/credits enabled.';
    case 'PROVIDER_LIMITED':
      return 'The provider rate-limited the check. Try again shortly.';
    case 'PROVIDER_UNREACHABLE':
      return 'Could not reach the provider to validate the key. Try again.';
    case 'KEY_ENC_UNAVAILABLE':
      return 'Key storage is temporarily unavailable. Try again later.';
    case 'NO_KEY':
      return 'No key is stored for this provider yet.';
    default:
      return fallback || 'Something went wrong. Try again.';
  }
}

export function ProviderKeyCard({ descriptor, status, onStatusChange }: Props) {
  const isSet = status?.set === true;
  const [editing, setEditing] = useState(!isSet);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function apply(result: KeyMutationResult, okMsg: string) {
    if (result.ok) {
      onStatusChange(result.status);
      setFeedback({ kind: 'ok', msg: okMsg });
      setDraft('');
      setEditing(result.status.set ? false : true);
    } else {
      setFeedback({ kind: 'err', msg: reasonFor(result.code, result.message) });
    }
  }

  async function handleSave() {
    const key = draft.trim();
    if (!key) return;
    setBusy('saving');
    setFeedback(null);
    apply(await putUserKey(descriptor.id, key), 'Key verified and saved.');
    setBusy(null);
  }

  async function handleVerify() {
    setBusy('verifying');
    setFeedback(null);
    apply(await verifyUserKey(descriptor.id), 'Key re-verified.');
    setBusy(null);
  }

  async function handleRemove() {
    setBusy('removing');
    setFeedback(null);
    const result = await deleteUserKey(descriptor.id);
    apply(result, 'Key removed.');
    if (result.ok) setEditing(true);
    setBusy(null);
  }

  const busyIcon = (
    <Loader2 size={12} strokeWidth={2} className="animate-spin" style={{ marginRight: 4 }} />
  );

  return (
    <div
      style={{
        border: '1px solid var(--color-pt-border)',
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)' }}>
          {descriptor.label} API key
        </span>
        {isSet && !editing ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--color-positive, #16794a)',
            }}
          >
            <Check size={13} strokeWidth={2.5} />
            Verified ···· {status?.last4 ?? '????'}
          </span>
        ) : null}
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <TextInput
            type="password"
            autoComplete="off"
            placeholder={descriptor.keyHint}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 36, padding: '6px 12px', fontSize: 12 }}
            disabled={busy !== null || draft.trim().length === 0}
            onClick={handleSave}
          >
            {busy === 'saving' ? busyIcon : null}
            {busy === 'saving' ? 'Verifying…' : 'Save key'}
          </button>
          {isSet ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 36, padding: '6px 10px', fontSize: 12 }}
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setDraft('');
                setFeedback(null);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
            disabled={busy !== null}
            onClick={() => {
              setEditing(true);
              setFeedback(null);
            }}
          >
            Replace
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
            disabled={busy !== null}
            onClick={handleVerify}
          >
            {busy === 'verifying' ? busyIcon : null}
            {busy === 'verifying' ? 'Verifying…' : 'Re-verify'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              minHeight: 32,
              padding: '4px 10px',
              fontSize: 12,
              color: 'var(--color-negative)',
            }}
            disabled={busy !== null}
            onClick={handleRemove}
          >
            {busy === 'removing' ? (
              busyIcon
            ) : (
              <X size={12} strokeWidth={2} style={{ marginRight: 4 }} />
            )}
            Remove
          </button>
        </div>
      )}

      {feedback ? (
        <span
          style={{
            fontSize: 12,
            color:
              feedback.kind === 'ok' ? 'var(--color-positive, #16794a)' : 'var(--color-negative)',
          }}
        >
          {feedback.msg}
        </span>
      ) : null}

      <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', lineHeight: 1.5 }}>
        <a
          href={descriptor.consoleUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color: 'var(--color-pt-accent, #2563eb)',
          }}
        >
          Get a {descriptor.label} key <ExternalLink size={11} strokeWidth={2} />
        </a>
        {' · '}
        Format {descriptor.keyHint}. The account needs billing or credits enabled — the most common
        cause of a verified key that still fails to generate.
      </div>
    </div>
  );
}
