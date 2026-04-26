import type { ReactNode } from 'react';
import type { TagKind } from './TagChip';
import { TAG_TONES } from './TagChip';

export interface SoapLineProps {
  text: ReactNode;
  anchor?: TagKind;
  edited?: boolean;
  billing?: boolean;
}

export function SoapLine({ text, anchor, edited, billing }: SoapLineProps) {
  return (
    <div
      className="flex items-start"
      style={{
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: edited ? 'var(--color-pt-amber-soft)' : 'transparent',
        border: edited
          ? '1px solid var(--color-pt-amber-border)'
          : '1px solid transparent',
        transition: 'background-color 120ms ease-out, border-color 120ms ease-out',
        fontSize: 13.5,
        lineHeight: 1.55,
        color: 'var(--color-pt-text)',
      }}
    >
      {anchor ? <AnchorSquare kind={anchor} /> : <span style={dotStyle} />}
      <div className="min-w-0 flex-1">{text}</div>
      {billing && (
        <span
          style={{
            background: 'var(--color-pt-violet-soft)',
            color: 'var(--color-pt-violet-fg)',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--color-pt-violet-border)',
          }}
        >
          Billing
        </span>
      )}
      {edited && (
        <span
          style={{
            background: 'var(--color-pt-amber)',
            color: '#ffffff',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          Edited
        </span>
      )}
    </div>
  );
}

const dotStyle = {
  width: 6,
  height: 6,
  marginTop: 8,
  borderRadius: '50%',
  background: '#c2cad6',
  flexShrink: 0,
} as const;

function AnchorSquare({ kind }: { kind: TagKind }) {
  const t = TAG_TONES[kind];
  return (
    <span
      style={{
        position: 'relative',
        width: 10,
        height: 10,
        marginTop: 6,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: 4,
          background: t.dot,
          opacity: 0.13,
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 2,
          background: t.dot,
        }}
      />
    </span>
  );
}
