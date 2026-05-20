import { useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
}

export function PhiConfirmDialog({ open, onCancel, onConfirm }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function handleConfirm() {
    onConfirm(dontShowAgain);
    setDontShowAgain(false);
  }

  function handleCancel() {
    onCancel();
    setDontShowAgain(false);
  }

  return (
    <Modal open={open} onClose={handleCancel} title="Send transcript to Anthropic?" size="sm">
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--color-caution)',
          background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
        }}
      >
        <AlertTriangle
          size={16}
          strokeWidth={2}
          style={{ color: 'var(--color-caution)', flexShrink: 0, marginTop: 1 }}
        />
        <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.55, margin: 0 }}>
          This will send data off of your device. All transcription text will be sent to Anthropic.
          Ensure your transcription text does not contain PHI.
        </p>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--color-pt-text-2)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          style={{ width: 15, height: 15, cursor: 'pointer' }}
        />
        Don't show this again
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" className="btn btn-ghost" onClick={handleCancel}>
          Go back
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>
          <Sparkles size={13} strokeWidth={2} /> I confirm — Generate Note
        </button>
      </div>
    </Modal>
  );
}
