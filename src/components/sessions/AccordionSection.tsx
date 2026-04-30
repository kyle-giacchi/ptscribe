import type { ReactNode } from 'react';
import { Lock, ChevronDown } from 'lucide-react';

export function AccordionSection({
  id,
  stepNum,
  title,
  open,
  onToggle,
  meta,
  children,
  locked,
}: {
  id: string;
  stepNum: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  meta?: ReactNode;
  children: ReactNode;
  locked?: boolean;
}) {
  const effectiveOpen = locked ? false : open;
  return (
    <section
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        borderRadius: 12,
        overflow: 'hidden',
        opacity: locked ? 0.5 : 1,
        transition: 'opacity 250ms ease-out',
      }}
    >
      <button
        type="button"
        aria-expanded={effectiveOpen}
        aria-controls={`accordion-body-${id}`}
        onClick={locked ? undefined : onToggle}
        className={`flex w-full items-center gap-3 text-left transition-colors${locked ? '' : 'hover:bg-[var(--color-pt-surface-alt)]'}`}
        style={{ padding: '12px 16px', cursor: locked ? 'not-allowed' : 'pointer' }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            background: 'var(--color-pt-surface-alt)',
            color: 'var(--color-pt-text-2)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          {stepNum}
        </span>
        <span className="font-display text-base font-semibold" style={{ color: 'var(--color-fg)' }}>
          {title}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {locked ? (
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              <Lock size={11} strokeWidth={2} /> Complete step above first
            </span>
          ) : (
            <>
              {meta}
              <ChevronDown
                size={16}
                strokeWidth={2}
                style={{
                  color: 'var(--color-fg-subtle)',
                  transform: effectiveOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms ease-out',
                  flexShrink: 0,
                }}
              />
            </>
          )}
        </div>
      </button>

      {/* CSS grid row trick: animates height without JS measurement */}
      <div
        id={`accordion-body-${id}`}
        style={{
          display: 'grid',
          gridTemplateRows: effectiveOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease-out',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              borderTop: '1px solid var(--color-pt-border)',
              padding: '14px 16px 16px',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
