import { useEffect, useState } from 'react';

const LOW_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB
const CRITICAL_STORAGE_BYTES = 50 * 1024 * 1024; //  50 MB

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface DeviceCapabilities {
  /** True while async checks (permissions, storage) are still in flight. */
  checking: boolean;
  micPermission: MicPermissionState;
  mediaRecorderSupported: boolean;
  wasmSupported: boolean;
  /** Available storage < 200 MB — warn but don't block. */
  storageLow: boolean;
  /** Available storage < 50 MB — recording will likely fail to save. */
  storageCritical: boolean;
  /** deviceMemory < 2 GB or hardwareConcurrency ≤ 2 — live Whisper may stutter. */
  isLowMemoryDevice: boolean;
}

export function useDeviceCapabilities(): DeviceCapabilities {
  const [checking, setChecking] = useState(true);
  const [micPermission, setMicPermission] = useState<MicPermissionState>('unavailable');
  const [storageLow, setStorageLow] = useState(false);
  const [storageCritical, setStorageCritical] = useState(false);

  const mediaRecorderSupported = typeof MediaRecorder !== 'undefined';
  const wasmSupported =
    typeof WebAssembly !== 'undefined' && typeof WebAssembly.compile === 'function';

  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
  const concurrency = navigator.hardwareConcurrency ?? 4;
  const isLowMemoryDevice = (deviceMemory !== undefined && deviceMemory < 2) || concurrency <= 2;

  useEffect(() => {
    let permStatus: PermissionStatus | null = null;

    async function check() {
      // Mic permission
      if (navigator.permissions) {
        try {
          permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPermission(permStatus.state as MicPermissionState);
          permStatus.onchange = () => {
            setMicPermission(permStatus!.state as MicPermissionState);
          };
        } catch {
          setMicPermission('unavailable');
        }
      }

      // Storage estimate
      if (navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const available = (est.quota ?? 0) - (est.usage ?? 0);
          setStorageCritical(available < CRITICAL_STORAGE_BYTES);
          setStorageLow(available < LOW_STORAGE_BYTES);
        } catch {
          // estimate unavailable — proceed without warning
        }
      }

      setChecking(false);
    }

    void check();

    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  return {
    checking,
    micPermission,
    mediaRecorderSupported,
    wasmSupported,
    storageLow,
    storageCritical,
    isLowMemoryDevice,
  };
}
