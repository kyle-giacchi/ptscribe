import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  onCancel: () => void;
  onRegenerate: () => void;
  onFinalizeAnyway: () => void;
}

export function StaleFinalizeDialog({ open, onCancel, onRegenerate, onFinalizeAnyway }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title="Finalize an out-of-date note?" size="sm">
      <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
        This note was generated from an earlier version of the transcript, template, or modifiers.
        Finalizing now records a note that doesn't match the current transcript — regenerate to sync
        them, or finalize as-is if the note is already what you want.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRegenerate}>
          Regenerate
        </button>
        <button type="button" className="btn btn-primary" onClick={onFinalizeAnyway}>
          Finalize anyway
        </button>
      </div>
    </Modal>
  );
}
