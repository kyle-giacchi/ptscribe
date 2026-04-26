import { TAG_TONES, type TagKind } from './TagChip';

export interface SourceClipButtonProps {
  timestamp: string;
  text: string;
  confidence?: number;
  kind?: TagKind;
  onClick?: () => void;
}

export function SourceClipButton({
  timestamp,
  text,
  confidence,
  kind = 'note',
  onClick,
}: SourceClipButtonProps) {
  const t = TAG_TONES[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full items-center text-left transition-colors hover:bg-[var(--color-pt-surface)]"
      style={{
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 9,
        background: 'var(--color-pt-surface-mut)',
        border: '1px solid var(--color-pt-border)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          background: t.dot,
          borderRadius: 2,
        }}
      />
      <span className="min-w-0">
        <span
          className="font-mono block"
          style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-pt-text-3)' }}
        >
          {timestamp}
        </span>
        <span
          className="block truncate"
          style={{ fontSize: 12.5, color: 'var(--color-pt-text)' }}
        >
          {text}
        </span>
      </span>
      {confidence !== undefined && (
        <span
          className="font-mono"
          style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)' }}
        >
          {Math.round(confidence * 100)}%
        </span>
      )}
    </button>
  );
}
