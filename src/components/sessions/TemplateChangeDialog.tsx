import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  targetTemplateName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TemplateChangeDialog({ open, targetTemplateName, onCancel, onConfirm }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title="Change template?" size="sm">
      <p style={{ fontSize: 14, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
        Switching to <strong>{targetTemplateName}</strong> will clear the text you've written in
        this note.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Change template
        </button>
      </div>
    </Modal>
  );
}
