export interface LetterChipProps {
  letter: string;
}

export function LetterChip({ letter }: LetterChipProps) {
  return (
    <span
      className="font-mono inline-flex items-center justify-center"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-pt-accent-fg)',
        background: 'var(--color-pt-accent-soft)',
        border: '1px solid var(--color-pt-accent-border)',
        borderRadius: 4,
        padding: '2px 7px',
        letterSpacing: '0.04em',
      }}
    >
      {letter}
    </span>
  );
}
