import { memo } from 'react';

/**
 * A small "Soon" pill, used to mark planned-but-not-yet-built affordances.
 * Pair it with a `disabled` PtButton (and a `title="Coming soon"`) so a
 * control that looks clickable reads as roadmap rather than breakage.
 */
export const ComingSoonChip = memo(function ComingSoonChip({ label = 'Soon' }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '1px 6px',
        borderRadius: 999,
        background: 'var(--color-pt-surface-alt)',
        border: '1px solid var(--color-pt-border)',
        color: 'var(--color-pt-text-3)',
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.3px',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
});
