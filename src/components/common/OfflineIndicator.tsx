import { useState, useEffect } from 'react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
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
        background: 'color-mix(in oklab, var(--color-caution) 14%, transparent)',
        borderBottom: '1px solid color-mix(in oklab, var(--color-caution) 28%, transparent)',
        color: 'var(--color-caution)',
      }}
    >
      You&apos;re offline — AI transcription and note generation are unavailable.
    </div>
  );
}
