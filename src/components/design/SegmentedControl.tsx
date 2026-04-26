import type { ReactNode } from 'react';

export interface SegmentedItem<V extends string> {
  value: V;
  label: ReactNode;
}

export interface SegmentedControlProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  items: SegmentedItem<V>[];
  size?: 'sm' | 'md';
}

export function SegmentedControl<V extends string>({
  value,
  onChange,
  items,
  size = 'md',
}: SegmentedControlProps<V>) {
  const padY = size === 'sm' ? 5 : 6;
  const padX = size === 'sm' ? 9 : 12;
  const fontSize = size === 'sm' ? 11.5 : 12.5;
  return (
    <div
      role="tablist"
      className="inline-flex items-center"
      style={{
        background: '#eaeef4',
        padding: 4,
        borderRadius: 10,
        gap: 2,
      }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className="transition-colors"
            style={{
              padding: `${padY}px ${padX}px`,
              borderRadius: 8,
              fontSize,
              fontWeight: 600,
              color: active ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
              background: active ? 'var(--color-pt-surface)' : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
