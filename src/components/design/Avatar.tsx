import { memo, useMemo } from 'react';

/** Quick-select swatches. `Patient.color` stores any hex, not just these. */
export const AVATAR_COLORS = [
  { label: 'Teal', hex: '#0e9384' },
  { label: 'Violet', hex: '#6941c6' },
  { label: 'Amber', hex: '#d97706' },
  { label: 'Red', hex: '#d92d20' },
  { label: 'Slate', hex: '#475467' },
  { label: 'Green', hex: '#12a150' },
  { label: 'Blue', hex: '#2970ff' },
  { label: 'Pink', hex: '#e0219b' },
] as const;

/** Any hue on the wheel, held to a saturation/lightness band that stays legible. */
export function randomAvatarColor(): string {
  return hslToHex(Math.floor(Math.random() * 360), 68, 42);
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const ch = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

/** Black or white, whichever reads on `hex`. Relative-luminance approximation. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#ffffff';
}

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length].hex;
}

export interface AvatarProps {
  name: string;
  /** Any hex color (`#rrggbb`). Falls back to a hash of `name` when absent. */
  color?: string;
  size?: 24 | 28 | 32 | 36 | 40 | 56;
  className?: string;
}

export const Avatar = memo(function Avatar({ name, color, size = 32, className }: AvatarProps) {
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
  const bg = color ?? hashColor(name || 'x');
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center font-sans font-semibold ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: bg,
        color: contrastText(bg),
        fontSize: Math.round(size * 0.36),
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
});
