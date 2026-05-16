import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const bannerBase = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  padding: '7px 16px',
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.4,
} as const;

export function OfflineIndicator() {
  const { isOffline, justRestored } = useNetworkStatus();

  if (isOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          ...bannerBase,
          background: 'color-mix(in oklab, var(--color-caution) 14%, transparent)',
          borderBottom: '1px solid color-mix(in oklab, var(--color-caution) 28%, transparent)',
          color: 'var(--color-caution)',
        }}
      >
        You&apos;re offline — AI transcription and note generation are unavailable.
      </div>
    );
  }

  if (justRestored) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          ...bannerBase,
          background: 'color-mix(in oklab, var(--color-success) 14%, transparent)',
          borderBottom: '1px solid color-mix(in oklab, var(--color-success) 28%, transparent)',
          color: 'var(--color-success)',
        }}
      >
        Back online — AI transcription and note generation are available.
      </div>
    );
  }

  return null;
}
