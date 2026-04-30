import { AlertTriangle } from 'lucide-react';

export function ConfirmBanner({
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
      style={{
        borderColor: 'var(--color-caution)',
        background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
      }}
    >
      <AlertTriangle
        size={13}
        strokeWidth={2}
        style={{ color: 'var(--color-caution)', flexShrink: 0 }}
      />
      <span style={{ color: 'var(--color-caution)' }}>{message}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" className="btn btn-ghost py-0.5 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary py-0.5 text-xs" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
