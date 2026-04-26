import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  Icon?: LucideIcon;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, Icon, actions }: Props) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-end gap-3">
        {Icon && (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: 'var(--color-accent-soft)' }}
          >
            <Icon size={16} strokeWidth={1.75} style={{ color: 'var(--color-accent-deep)' }} />
          </div>
        )}
        <div>
          <h1
            className="font-display text-2xl leading-none"
            style={{ color: 'var(--color-fg)', letterSpacing: '-0.02em' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-fg-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
