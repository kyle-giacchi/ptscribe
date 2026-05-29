import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Upload } from 'lucide-react';
import { useDismissable } from '@/hooks/useDismissable';
import { AudioFileInput, type AudioFileInputHandle } from '@/components/common/AudioFileInput';

interface AddClipButtonProps {
  onRecord: () => void;
  onUpload: (file: File) => void;
}

export function AddClipButton({ onRecord, onUpload }: AddClipButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<AudioFileInputHandle>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    chevronRef.current?.focus();
  }, []);
  useDismissable({ open, onClose: close, ref });

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!menuRef.current) return;
        const items = Array.from(
          menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
        );
        if (items.length === 0) return;
        const current = document.activeElement as HTMLElement | null;
        const idx = items.findIndex((el) => el === current);
        const next =
          e.key === 'ArrowDown'
            ? items[(idx + 1 + items.length) % items.length]
            : items[(idx - 1 + items.length) % items.length];
        e.preventDefault();
        next.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function handleFilePick(f: File) {
    onUpload(f);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-flex" style={{ borderRadius: 8 }}>
      {/* Main half */}
      <button
        type="button"
        onClick={onRecord}
        className="inline-flex items-center"
        style={{
          gap: 6,
          height: 32,
          padding: '0 12px',
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
          borderRight: 'none',
          borderTopLeftRadius: 7,
          borderBottomLeftRadius: 7,
          fontSize: 12.5,
          fontWeight: 500,
          color: 'var(--color-pt-text)',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: 'var(--color-pt-red, #dc2626)',
          }}
        />
        New recording
      </button>

      {/* Chevron half */}
      <button
        ref={chevronRef}
        type="button"
        aria-label="Add clip menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center"
        style={{
          width: 28,
          height: 32,
          background: open ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
          borderTopRightRadius: 7,
          borderBottomRightRadius: 7,
          color: open ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
          cursor: 'pointer',
        }}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute z-40"
          style={{
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 240,
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: 4,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRecord();
            }}
            className="flex w-full items-center gap-2"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              fontSize: 12.5,
              color: 'var(--color-pt-text)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: 'var(--color-pt-red, #dc2626)',
              }}
            />
            Record new clip
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => fileRef.current?.open()}
            className="flex w-full items-center gap-2"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              fontSize: 12.5,
              color: 'var(--color-pt-text)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Upload size={13} strokeWidth={2} />
            Upload audio file
          </button>
          <AudioFileInput ref={fileRef} onPick={handleFilePick} />
        </div>
      )}
    </div>
  );
}
