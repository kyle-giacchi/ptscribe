import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Settings2, Check } from 'lucide-react';
import type { NoteTemplate } from '@/types';

interface TemplateDropdownProps {
  template: NoteTemplate | undefined;
  templates: NoteTemplate[];
  onChange: (id: string) => void;
  onManage: () => void;
}

export function TemplateDropdown({
  template,
  templates,
  onChange,
  onManage,
}: TemplateDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1.5 rounded-lg transition-colors"
        style={{
          padding: '5px 10px',
          fontSize: 12.5,
          fontWeight: 600,
          height: 32,
          border: '1px solid var(--color-pt-border)',
          background: open ? 'var(--color-pt-surface-alt)' : 'var(--color-pt-surface)',
          color: 'var(--color-pt-text)',
          cursor: 'pointer',
          boxSizing: 'border-box' as const,
        }}
      >
        <span style={{ color: 'var(--color-pt-text-2)', fontWeight: 400, fontSize: 11 }}>
          Template
        </span>
        <span
          style={{
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {template?.name ?? 'None'}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{
            color: 'var(--color-pt-text-2)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 180ms ease',
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width: 340,
            borderRadius: 12,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: '1px solid var(--color-pt-border)',
              background: 'var(--color-pt-surface-alt)',
            }}
          >
            <span
              className="text-[11px] font-semibold tracking-widest uppercase"
              style={{ color: 'var(--color-pt-text-2)' }}
            >
              Choose Template
            </span>
          </div>

          {/* Template list */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {templates.length === 0 && (
              <p
                className="px-4 py-6 text-center text-sm"
                style={{ color: 'var(--color-pt-text-2)' }}
              >
                No templates available.
              </p>
            )}
            {templates.map((t) => {
              const isActive = t.id === template?.id;
              const sectionSummary = t.sections.map((s) => s.label).join(', ');
              const content = (
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'var(--color-pt-text)' }}
                    >
                      {t.name}
                    </span>
                    {isActive && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            'color-mix(in oklab, var(--color-pt-accent) 15%, transparent)',
                          color: 'var(--color-pt-accent-fg)',
                        }}
                      >
                        <Check size={9} strokeWidth={3} />
                        active
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-0.5 text-[11px] leading-snug"
                    style={{ color: 'var(--color-pt-text-2)' }}
                  >
                    {sectionSummary}
                  </p>
                </div>
              );
              const sharedStyle = {
                borderBottom: '1px solid var(--color-pt-border)',
                background: isActive
                  ? 'color-mix(in oklab, var(--color-pt-accent) 6%, var(--color-pt-surface))'
                  : undefined,
              };
              if (isActive) {
                return (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-3" style={sharedStyle}>
                    {content}
                  </div>
                );
              }
              return (
                <button
                  key={t.id}
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3"
                  style={{
                    ...sharedStyle,
                    cursor: 'pointer',
                    border: 'none',
                    background: sharedStyle.background,
                  }}
                  onClick={() => {
                    onChange(t.id);
                    setOpen(false);
                  }}
                >
                  {content}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{
              background: 'var(--color-pt-surface-alt)',
              borderTop: '1px solid var(--color-pt-border)',
            }}
          >
            <span className="text-[11px]" style={{ color: 'var(--color-pt-text-2)' }}>
              Changing template clears the current note.
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-medium"
              style={{
                color: 'var(--color-pt-accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              <Settings2 size={11} strokeWidth={2} />
              Manage
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
