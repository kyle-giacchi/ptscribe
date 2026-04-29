// 5 MB cap on the stored (post-encryption) value. For vault-encrypted AppData,
// DataRepository.save() pre-checks the plaintext at 3.5 MB so the encrypted
// envelope (~4.8 MB) stays safely under this limit.
export const MAX_OBJECT_BYTES = 5 * 1024 * 1024;

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
