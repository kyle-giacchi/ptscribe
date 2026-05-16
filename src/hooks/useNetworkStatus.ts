import { useState, useEffect, useRef } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  /** True for ~3 s after recovering from an offline period. */
  justRestored: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [justRestored, setJustRestored] = useState(false);
  const wasOfflineRef = useRef(!navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      wasOfflineRef.current = false;
      setIsOnline(true);
      setJustRestored(true);
    }
    function handleOffline() {
      wasOfflineRef.current = true;
      setIsOnline(false);
      setJustRestored(false);
    }
    // visibilitychange catches sleep/wake when browser events don't fire reliably
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      const online = navigator.onLine;
      if (online && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setIsOnline(true);
        setJustRestored(true);
      } else if (!online) {
        wasOfflineRef.current = true;
        setIsOnline(false);
      }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!justRestored) return;
    const t = setTimeout(() => setJustRestored(false), 3000);
    return () => clearTimeout(t);
  }, [justRestored]);

  return { isOnline, isOffline: !isOnline, justRestored };
}
