import { type ReactNode } from 'react';
import { X } from 'lucide-react';

// ── Shared banner for all status/warning/info notices ─────────────────────────
export function StatusBanner({
  icon,
  color,
  children,
  action,
  onDismiss,
}: {
  icon: ReactNode;
  color: 'caution' | 'negative' | 'info';
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const tokens =
    color === 'caution'
      ? {
          border: 'var(--color-pt-amber-border)',
          accent: 'var(--color-pt-amber)',
          bg: 'color-mix(in oklab, var(--color-pt-amber) 8%, var(--color-pt-surface))',
          fg: 'var(--color-pt-amber-fg)',
        }
      : color === 'negative'
        ? {
            border: 'var(--color-pt-red-border)',
            accent: 'var(--color-pt-red)',
            bg: 'color-mix(in oklab, var(--color-pt-red) 6%, var(--color-pt-surface))',
            fg: 'var(--color-pt-red-fg)',
          }
        : {
            border: 'var(--color-pt-accent-border)',
            accent: 'var(--color-pt-accent)',
            bg: 'color-mix(in oklab, var(--color-pt-accent) 7%, var(--color-pt-surface))',
            fg: 'var(--color-pt-accent-fg)',
          };

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-xs"
      style={{
        borderTop: `1px solid ${tokens.border}`,
        borderRight: `1px solid ${tokens.border}`,
        borderBottom: `1px solid ${tokens.border}`,
        borderLeft: `3px solid ${tokens.accent}`,
        background: tokens.bg,
        color: tokens.fg,
      }}
    >
      <span style={{ marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span className="flex-1 leading-relaxed">{children}</span>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-1 flex shrink-0 items-center justify-center rounded transition-opacity hover:opacity-70"
          style={{
            color: tokens.fg,
            minHeight: 24,
            minWidth: 24,
            touchAction: 'manipulation',
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
