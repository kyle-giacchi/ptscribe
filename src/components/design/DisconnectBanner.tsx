import { AlertTriangle, X } from 'lucide-react';

export interface DisconnectBannerProps {
  message?: string;
  onReplayTone?: () => void;
  onReconnect?: () => void;
  onDismiss?: () => void;
}

export function DisconnectBanner({
  message = 'Recording paused. Last audio captured a few seconds ago. Reconnect the mic or switch to device input.',
  onReplayTone,
  onReconnect,
  onDismiss,
}: DisconnectBannerProps) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2"
      style={{
        top: 16,
        zIndex: 50,
        minWidth: 540,
        maxWidth: '90%',
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-red-border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-banner)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
      role="alert"
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--color-pt-red-soft)',
          border: '1px solid var(--color-pt-red-border)',
          color: 'var(--color-pt-red)',
        }}
      >
        <AlertTriangle size={18} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-pt-text)' }}>
          Microphone disconnected
        </div>
        <div
          style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)', marginTop: 2 }}
        >
          {message}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onReplayTone && (
          <button
            type="button"
            onClick={onReplayTone}
            className="transition-colors hover:bg-[var(--color-pt-surface-mut)]"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-pt-border)',
              background: 'var(--color-pt-surface)',
              fontSize: 12.5,
              color: 'var(--color-pt-text)',
            }}
          >
            Replay tone
          </button>
        )}
        {onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'var(--color-pt-red)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
            }}
          >
            Reconnect
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid var(--color-pt-border)',
              background: 'var(--color-pt-surface)',
              color: 'var(--color-pt-text-2)',
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
