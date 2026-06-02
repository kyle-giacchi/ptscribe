import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { AiCallError as AiCallErrorClass, friendlyAiError } from '@/services/ai/errors';

interface Props {
  error: AiCallErrorClass;
  onRetry?: () => void;
  onDismiss?: () => void;
  /** When true, an expandable details section shows the raw provider message. DEV-only by default. */
  showRawDetail?: boolean;
}

export function AiCallError({
  error,
  onRetry,
  onDismiss,
  showRawDetail = import.meta.env.DEV,
}: Props) {
  const friendly = friendlyAiError(error);

  function handleAction() {
    if (friendly.action === 'refresh') {
      window.location.reload();
      return;
    }
    if (friendly.action === 'open_settings') {
      window.location.assign('/settings');
      return;
    }
    if (friendly.action === 'signin') {
      window.location.assign('/login');
      return;
    }
    onRetry?.();
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--color-caution)',
        background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
      }}
    >
      <AlertTriangle
        size={16}
        strokeWidth={2}
        style={{ color: 'var(--color-caution)', flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)' }}>
          {friendly.title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--color-pt-text-2)',
            lineHeight: 1.5,
            marginTop: 2,
          }}
        >
          {friendly.description}
        </div>
        {showRawDetail && error.rawDetail ? (
          <details style={{ marginTop: 6, fontSize: 11, color: 'var(--color-pt-text-3)' }}>
            <summary style={{ cursor: 'pointer' }}>Technical detail</summary>
            <pre
              style={{
                marginTop: 4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'inherit',
              }}
            >
              {error.rawDetail}
            </pre>
          </details>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
            onClick={handleAction}
          >
            <RefreshCw size={12} strokeWidth={2} style={{ marginRight: 4 }} />
            {friendly.actionLabel}
          </button>
          {onDismiss ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
              onClick={onDismiss}
            >
              <X size={12} strokeWidth={2} style={{ marginRight: 4 }} />
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
