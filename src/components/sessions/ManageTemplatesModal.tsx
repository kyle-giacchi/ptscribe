import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Templates } from '@/pages/Templates';

interface ManageTemplatesModalProps {
  open: boolean;
  onClose: () => void;
}

export function ManageTemplatesModal({ open, onClose }: ManageTemplatesModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'oklch(0.28 0.03 250 / 0.4)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage Templates"
        className="flex w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
        style={{
          maxWidth: 700,
          maxHeight: '90dvh',
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-pt-border)' }}
        >
          <span className="text-base font-semibold" style={{ color: 'var(--color-pt-text)' }}>
            Manage Templates
          </span>
          <button
            type="button"
            className="btn btn-ghost p-2.5"
            onClick={onClose}
            aria-label="Close"
            autoFocus
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <Templates />
        </div>
      </div>
    </div>
  );
}
