import { vault } from './vault';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { audioRepository } from '@/services/AudioRepository';

const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

export function isLikelyEncryptedAudio(buf: Uint8Array): boolean {
  for (let i = 0; i < WEBM_MAGIC.length; i += 1) {
    if (buf[i] !== WEBM_MAGIC[i]) return true;
  }
  return false;
}

export interface MigrationResult {
  migratedAppData: boolean;
  migratedClips: number;
}

function looksLikeEnvelope(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed?.v === 1 && typeof parsed.iv === 'string' && typeof parsed.ciphertext === 'string'
    );
  } catch {
    return false;
  }
}

export async function migrateLegacyPlaintext(): Promise<MigrationResult> {
  if (!vault.isUnlocked()) throw new Error('vault: locked — migration requires unlock');

  let migratedAppData = false;
  const raw = localStorage.getItem(STORAGE_KEYS.appData);
  if (raw && !looksLikeEnvelope(raw)) {
    const envelope = await vault.encryptUtf8(raw);
    localStorage.setItem(STORAGE_KEYS.appData, envelope);
    migratedAppData = true;
  }

  let migratedClips = 0;
  const keys = await audioRepository.listKeys().catch(() => [] as string[]);
  for (const key of keys) {
    try {
      const blob = await audioRepository.loadRaw(key);
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (isLikelyEncryptedAudio(bytes)) continue;
      const encrypted = await vault.encryptBlob(
        new Blob([bytes], { type: blob.type || 'audio/webm' }),
      );
      await audioRepository.saveRaw(key, encrypted);
      migratedClips += 1;
    } catch {
      /* best-effort: skip this clip */
    }
  }

  return { migratedAppData, migratedClips };
}
