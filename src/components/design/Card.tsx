import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface SurfaceCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: number | string;
  radius?: number;
  muted?: boolean;
  bordered?: boolean;
}

export function SurfaceCard({
  children,
  padding = 0,
  radius = 14,
  muted,
  bordered = true,
  style,
  className,
  ...rest
}: SurfaceCardProps) {
  const merged: CSSProperties = {
    background: muted ? 'var(--color-pt-surface-mut)' : 'var(--color-pt-surface)',
    border: bordered ? '1px solid var(--color-pt-border)' : 'none',
    borderRadius: radius,
    padding,
    overflow: 'hidden',
    ...style,
  };
  return (
    <div className={className} style={merged} {...rest}>
      {children}
    </div>
  );
}

export interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <div
      className={className}
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        color: 'var(--color-pt-text-3)',
      }}
    >
      {children}
    </div>
  );
}
