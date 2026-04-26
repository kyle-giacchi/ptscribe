export const MAX_OBJECT_BYTES = 5 * 1024 * 1024; // 5 MB

function isAvailable(): boolean {
  try {
    const k = '__sl_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function validateObjectSize(value: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return;
  }
  if (parsed === null || typeof parsed !== 'object') {
    return;
  }
  const bytes = new Blob([value]).size;
  if (bytes > MAX_OBJECT_BYTES) {
    throw new Error(`safeLocalStorage: payload ${bytes} bytes exceeds cap ${MAX_OBJECT_BYTES}`);
  }
}

export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (!isAvailable()) return null;
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (!isAvailable()) return;
    validateObjectSize(value);
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (!isAvailable()) return;
    window.localStorage.removeItem(key);
  },
};
