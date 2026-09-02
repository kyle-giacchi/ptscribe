import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  onCancel: () => void;
  onRegenerate: (feedback: string) => void;
}

export function GenerateFeedbackDialog({ open, onCancel, onRegenerate }: Props) {
  const [text, setText] = useState('');

  function close() {
    setText('');
    onCancel();
  }

  return (
    <Modal open={open} onClose={close} title="What would you like improved?" size="sm">
      <p
        style={{
          fontSize: 'var(--text-md)',
          color: 'var(--color-pt-text-2)',
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        The transcript and settings haven't changed. Tell the AI what to fix.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. The assessment was too vague — expand functional limitations"
        autoFocus
        style={{
          width: '100%',
          minHeight: 80,
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          color: 'var(--color-pt-text)',
          fontSize: 'var(--text-base)',
          lineHeight: 1.5,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!text.trim()}
          onClick={() => {
            const fb = text.trim();
            setText('');
            onRegenerate(fb);
          }}
        >
          <RotateCw size={13} strokeWidth={2} /> Regenerate
        </button>
      </div>
    </Modal>
  );
}
