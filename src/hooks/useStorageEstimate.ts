import { useCallback, useEffect, useState } from 'react';

// Whisper tiny (q8) ~75 MB + privacy-filter ~30 MB, with headroom.
const LOCAL_MODELS_MIN_BYTES = 150 * 1024 * 1024;

export interface StorageEstimate {
  loading: boolean;
  /** Total storage quota granted to this origin (bytes), or null if unavailable. */
  quota: number | null;
  /** Storage currently in use (bytes), or null if unavailable. */
  usage: number | null;
  /** Bytes remaining (quota − usage), or null if unavailable. */
  available: number | null;
  /** True when navigator.storage.persist() has been granted for this origin. */
  isPersistent: boolean;
  /** True when available space is below the minimum needed for on-device models. */
  localModelsUnavailable: boolean;
}

export function useStorageEstimate(): StorageEstimate {
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<number | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [est, persistent] = await Promise.all([
        navigator.storage?.estimate?.() ?? Promise.resolve({}),
        navigator.storage?.persisted?.() ?? Promise.resolve(false),
      ]);
      setQuota(est.quota ?? null);
      setUsage(est.usage ?? null);
      setIsPersistent(persistent);
    } catch {
      // API unavailable — leave null, localModelsUnavailable stays false
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Re-check when the user returns to the tab — they may have cleared storage elsewhere.
    function handleVisibility() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  const available = quota !== null && usage !== null ? quota - usage : null;
  const localModelsUnavailable = available !== null && available < LOCAL_MODELS_MIN_BYTES;

  return { loading, quota, usage, available, isPersistent, localModelsUnavailable };
}
