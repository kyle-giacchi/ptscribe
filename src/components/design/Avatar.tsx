import { useMemo } from 'react';

const VARIANTS = [
  { bg: '#e6f7f6', fg: '#0a6d70' }, // cyan
  { bg: '#eeebfa', fg: '#4a3aa3' }, // violet
  { bg: '#fdf3df', fg: '#7a4c04' }, // amber
  { bg: '#fdecee', fg: '#9b1d2e' }, // red
  { bg: '#f1f3f7', fg: '#374055' }, // slate
] as const;

function hashIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % VARIANTS.length;
}

export interface AvatarProps {
  name: string;
  size?: 24 | 28 | 32 | 36 | 40 | 56;
  className?: string;
}

export function Avatar({ name, size = 32, className }: AvatarProps) {
  const initials = useMemo(
    () =>
      (name || '?')
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?',
    [name],
  );
  const variant = VARIANTS[hashIndex(name || 'x')];
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center font-sans font-semibold ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: variant.bg,
        color: variant.fg,
        fontSize: Math.round(size * 0.36),
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
