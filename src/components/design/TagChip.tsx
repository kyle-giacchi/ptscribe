import { memo } from 'react';

export type TagKind = 'pain' | 'rom' | 'strength' | 'home' | 'note';

export const TAG_TONES: Record<
  TagKind,
  { bg: string; border: string; dot: string; fg: string; label: string }
> = {
  pain: { bg: '#fdecee', border: '#f5b8bf', dot: '#dc2942', fg: '#9b1d2e', label: 'Pain' },
  rom: { bg: '#e6f7f6', border: '#9fdcdc', dot: '#0ea5a8', fg: '#0a6d70', label: 'ROM' },
  strength: {
    bg: '#eeebfa',
    border: '#cfc6ee',
    dot: '#6f5acc',
    fg: '#4a3aa3',
    label: 'Strength',
  },
  home: { bg: '#fdf3df', border: '#f0d495', dot: '#c47a09', fg: '#7a4c04', label: 'HEP' },
  note: { bg: '#f1f3f7', border: '#dde2ea', dot: '#7c8699', fg: '#374055', label: 'Note' },
};

export interface TagChipProps {
  kind: TagKind;
  text?: string;
}

export const TagChip = memo(function TagChip({ kind, text }: TagChipProps) {
  const t = TAG_TONES[kind];
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 6,
        padding: '5px 10px',
        borderRadius: 7,
        border: `1px solid ${t.border}`,
        background: t.bg,
        fontSize: 12.5,
        color: 'var(--color-pt-text)',
        maxWidth: '100%',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: t.dot,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: t.fg,
        }}
      >
        {t.label}
      </span>
      {text && <span className="truncate">{text}</span>}
    </span>
  );
});

export interface QuickTagButtonProps {
  kind: TagKind;
  onClick?: () => void;
  label?: string;
}

export const QuickTagButton = memo(function QuickTagButton({
  kind,
  onClick,
  label,
}: QuickTagButtonProps) {
  const t = TAG_TONES[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
      style={{
        gap: 8,
        padding: '10px 12px',
        borderRadius: 9,
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-border)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--color-pt-text)',
        width: '100%',
        justifyContent: 'flex-start',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: t.dot,
        }}
      />
      <span>{label ?? t.label}</span>
    </button>
  );
});
