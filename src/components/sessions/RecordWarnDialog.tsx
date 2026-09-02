import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RecordWarnDialog({ open, onCancel, onConfirm }: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Recording more will invalidate your generated note"
      size="sm"
    >
      <p
        style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-pt-text-2)',
          lineHeight: 1.55,
        }}
      >
        Any new clips will be added to your transcript, but your note was generated from the
        previous transcript. You&apos;ll need to re-run transcription and regenerate before the note
        reflects this recording.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Continue recording
        </button>
      </div>
    </Modal>
  );
}
