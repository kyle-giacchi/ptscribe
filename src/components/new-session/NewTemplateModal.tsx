import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { PtButton } from '@/components/design';

export function NewTemplateModal({
  open,
  visitTypeLabel,
  onClose,
  onCreate,
}: {
  open: boolean;
  visitTypeLabel: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <Modal
      open={open}
      onClose={() => {
        setName('');
        onClose();
      }}
      title="New custom template"
      size="sm"
    >
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-3)', margin: 0 }}>
        Saved as a {visitTypeLabel.toLowerCase()} template. You can edit sections and the
        AI prompt later from the Templates page.
      </p>
      <Field label="Template name">
        <TextInput
          autoFocus
          value={name}
          placeholder={`My ${visitTypeLabel.toLowerCase()} template`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onCreate(name);
              setName('');
            }
          }}
        />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <PtButton
          variant="ghost"
          onClick={() => {
            setName('');
            onClose();
          }}
        >
          Cancel
        </PtButton>
        <PtButton
          variant="primary"
          disabled={!name.trim()}
          onClick={() => {
            onCreate(name);
            setName('');
          }}
        >
          Create
        </PtButton>
      </div>
    </Modal>
  );
}
