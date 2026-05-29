import { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { useAppData } from '@/contexts/AppDataProvider';
import { audioRepository } from '@/services/AudioRepository';
import { dataRepository } from '@/services/DataRepository';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { defaultAppData } from '@/schemas';

interface DemoCompleteModalProps {
  open: boolean;
  onClose: () => void;
}

export function DemoCompleteModal({ open, onClose }: DemoCompleteModalProps) {
  const { resetAll } = useAppData();
  const [resetting, setResetting] = useState(false);

  async function handleStartFresh() {
    setResetting(true);
    try {
      try {
        await audioRepository.clear();
      } catch {
        /* ignore audio errors */
      }
      dataRepository.clearCorruptData();
      localStorage.removeItem(STORAGE_KEYS.pageModes);
      await dataRepository.save(defaultAppData());
      resetAll();
    } catch {
      toast.error('Reset failed — please try again.');
      setResetting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'color-mix(in oklab, var(--color-positive) 12%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckCircle2 size={24} strokeWidth={2} style={{ color: 'var(--color-positive)' }} />
        </div>
        <div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-pt-text)',
              marginBottom: 6,
            }}
          >
            Session complete!
          </h3>
          <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.6 }}>
            The demo patient has been discharged. Start fresh to reset the demo and try again from
            the beginning.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          className="btn btn-primary w-full"
          style={{ height: 40, fontSize: 13.5, fontWeight: 700 }}
          disabled={resetting}
          onClick={handleStartFresh}
        >
          <RotateCcw size={14} strokeWidth={2} />
          {resetting ? 'Resetting…' : 'Start fresh'}
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full"
          style={{ height: 36, fontSize: 13 }}
          disabled={resetting}
          onClick={onClose}
        >
          Keep exploring
        </button>
      </div>
    </Modal>
  );
}
