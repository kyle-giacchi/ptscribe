import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'accent-soft';

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-pt-accent)',
    color: '#ffffff',
    border: 'none',
    padding: '9px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
  },
  ghost: {
    background: 'var(--color-pt-surface)',
    color: 'var(--color-pt-text)',
    border: '1px solid var(--color-pt-border)',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 500,
  },
  danger: {
    background: 'var(--color-pt-red)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
  },
  'accent-soft': {
    background: 'var(--color-pt-accent-soft)',
    color: 'var(--color-pt-accent-fg)',
    border: '1px solid var(--color-pt-accent-border)',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
  },
};

export interface PtButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export function PtButton({
  variant = 'ghost',
  iconLeft,
  iconRight,
  children,
  style,
  className,
  disabled,
  ...rest
}: PtButtonProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 transition-colors ${className ?? ''}`}
      style={{
        ...v,
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      {...rest}
    >
      {iconLeft}
      {children && <span>{children}</span>}
      {iconRight}
    </button>
  );
}
