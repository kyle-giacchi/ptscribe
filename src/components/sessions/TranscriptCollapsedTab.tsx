interface TranscriptCollapsedTabProps {
  onExpand: () => void;
}

export function TranscriptCollapsedTab({ onExpand }: TranscriptCollapsedTabProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Expand transcript panel"
      style={{
        position: 'absolute', top: 0, right: 0,
        writingMode: 'vertical-rl',
        height: 120, padding: '12px 6px',
        border: '1px solid var(--color-pt-border)',
        borderRight: 'none', borderRadius: '8px 0 0 8px',
        background: 'var(--color-pt-surface)',
        color: 'var(--color-pt-text-2)', cursor: 'pointer',
        fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em',
      }}
    >
      Transcript
    </button>
  );
}
