import { vault } from './vault';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { audioRepository } from '@/services/AudioRepository';
import { isPlaintextAudio } from '@/lib/audio/sniff';

export function isLikelyEncryptedAudio(buf: Uint8Array): boolean {
  return !isPlaintextAudio(buf);
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
