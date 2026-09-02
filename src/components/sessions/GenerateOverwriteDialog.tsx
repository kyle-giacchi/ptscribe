import { RotateCw, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  onCancel: () => void;
  onAppend: () => void;
  onReplace: () => void;
}

export function GenerateOverwriteDialog({ open, onCancel, onAppend, onReplace }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title="This note already has content" size="sm">
      <p style={{ fontSize: 'var(--text-md)', color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
        You've already written into this note. Choose <strong>Append</strong> to add the newly
        generated text below what's there, or <strong>Replace</strong> to overwrite it. Replacing
        cannot be undone.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-secondary" onClick={onAppend}>
          <Sparkles size={13} strokeWidth={2} /> Append
        </button>
        <button type="button" className="btn btn-primary" onClick={onReplace}>
          <RotateCw size={13} strokeWidth={2} /> Replace
        </button>
      </div>
    </Modal>
  );
}
