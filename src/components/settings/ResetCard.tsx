import { Eraser, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useAppData } from '@/contexts/AppDataProvider';
import { audioRepository } from '@/services/AudioRepository';
import { dataRepository } from '@/services/DataRepository';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { defaultAppData } from '@/schemas';
import { auditLog } from '@/lib/audit/auditLog';

export function ResetCard() {
  const { resetAll } = useAppData();

  async function handleReset() {
    if (
      !confirm('Erase ALL local data — patients, sessions, notes, audio? This cannot be undone.')
    ) {
      return;
    }
    try {
      await audioRepository.clear();
    } catch {
      /* ignore */
    }
    dataRepository.clearCorruptData();
    localStorage.removeItem(STORAGE_KEYS.pageModes);
    // Save fresh data first so there is never a window with no persisted state,
    // then reset in-memory (resetAll no longer calls clear).
    await dataRepository.save(defaultAppData());
    resetAll();
    void auditLog.append('data:reset');
    toast.success('All local data erased');
  }

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Eyebrow>Reset</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Erase all local data: patients, sessions, notes, templates, exercises, and audio. This
          cannot be undone.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <PtButton
            variant="ghost"
            iconLeft={<RefreshCw size={14} strokeWidth={2} />}
            onClick={() => window.location.reload()}
          >
            Reload app
          </PtButton>
          <PtButton
            variant="danger"
            iconLeft={<Eraser size={14} strokeWidth={2} />}
            onClick={handleReset}
          >
            Erase everything
          </PtButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
