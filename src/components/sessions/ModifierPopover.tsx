import { useEffect, useRef } from 'react';
import type { ModifierEmphasis, ModifierTone, SessionModifiers } from '@/types';

interface ModifierPopoverProps {
  modifiers: SessionModifiers;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onChange: (next: SessionModifiers) => void;
}

const TONE_CHIPS: { value: ModifierTone; label: string }[] = [
  { value: 'narrative', label: 'Narrative' },
  { value: 'terse', label: 'Terse' },
  { value: 'clinical', label: 'Clinical / Formal' },
];

const EMPHASIS_CHIPS: { value: ModifierEmphasis; label: string }[] = [
  { value: 'more_detail', label: 'More detail' },
  { value: 'functional_outcomes', label: 'Functional outcomes' },
  { value: 'patient_progress', label: 'Patient progress' },
];

export function ModifierPopover({ modifiers, anchorRef, onClose, onChange }: ModifierPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [anchorRef, onClose]);

  function setTone(tone: ModifierTone) {
    onChange({ ...modifiers, tone: modifiers.tone === tone ? undefined : tone });
  }

  function toggleEmphasis(value: ModifierEmphasis) {
    const has = modifiers.emphasis.includes(value);
    onChange({
      ...modifiers,
      emphasis: has ? modifiers.emphasis.filter((e) => e !== value) : [...modifiers.emphasis, value],
    });
  }

  function setCustom(text: string) {
    onChange({ ...modifiers, customInstruction: text.slice(0, 200) });
  }

  const chipBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--color-pt-border)',
    background: 'var(--color-pt-surface)',
    color: 'var(--color-pt-text-2)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
  };

  const chipActive: React.CSSProperties = {
    ...chipBase,
    background: 'var(--color-pt-accent, #2563eb)',
    borderColor: 'var(--color-pt-accent, #2563eb)',
    color: '#fff',
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        zIndex: 200,
        width: 300,
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-border)',
        borderRadius: 10,
        padding: '14px 16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Tone */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-pt-text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tone
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TONE_CHIPS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              style={modifiers.tone === value ? chipActive : chipBase}
              onClick={() => setTone(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Emphasis */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-pt-text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Emphasis
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {EMPHASIS_CHIPS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              style={modifiers.emphasis.includes(value) ? chipActive : chipBase}
              onClick={() => toggleEmphasis(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom instruction */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-pt-text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Custom instruction
        </div>
        <textarea
          value={modifiers.customInstruction ?? ''}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="e.g. Focus on home exercise compliance"
          maxLength={200}
          rows={2}
          style={{
            width: '100%',
            resize: 'none',
            borderRadius: 6,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-bg, var(--color-pt-surface))',
            color: 'var(--color-pt-text)',
            fontSize: 12.5,
            padding: '6px 8px',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--color-pt-text-2)', textAlign: 'right', marginTop: 2 }}>
          {(modifiers.customInstruction ?? '').length}/200
        </div>
      </div>
    </div>
  );
}
