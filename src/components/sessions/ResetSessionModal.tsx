import { RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface ResetSessionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResetSessionModal({ open, onClose, onConfirm }: ResetSessionModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Reset Session" size="sm">
      <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
        This will permanently delete all recordings and transcriptions for this session,
        including any generated note. The session will return to a fresh state.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn"
          style={{ background: 'var(--color-pt-danger, #dc2626)', color: '#fff', border: 'none' }}
          onClick={onConfirm}
        >
          <RotateCcw size={13} strokeWidth={2} />
          Reset Session
        </button>
      </div>
    </Modal>
  );
}
