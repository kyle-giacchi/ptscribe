import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Shared presentational atoms for the Debug Menu panels migrated from the old
 * Admin page. Kept tiny and dependency-free so they can be reused across the
 * environment, storage, audio, and transcript panels.
 */

export function useCopy(): { copied: string | null; copy: (text: string, key?: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, key?: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        const k = key ?? text;
        setCopied(k);
        setTimeout(() => setCopied(null), 1800);
      })
      .catch(() => {});
  }, []);
  return { copied, copy };
}

export function KVRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const { copied, copy } = useCopy();
  const isCopied = copied === value;
  return (
    <div
      className="group flex items-baseline justify-between gap-3 py-1.5 transition-colors"
      style={{
        borderBottom: '1px solid var(--color-pt-border)',
        cursor: copyable ? 'pointer' : 'default',
        borderRadius: copyable ? 4 : 0,
      }}
      onClick={copyable ? () => copy(value) : undefined}
      title={copyable ? `Click to copy` : undefined}
    >
      <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)', flexShrink: 0 }}>{label}</span>
      <span
        className="flex items-center gap-1.5"
        style={{
          fontSize: 11,
          color: 'var(--color-pt-text)',
          textAlign: 'right',
          wordBreak: 'break-all',
          fontFamily: mono ? 'var(--font-mono, ui-monospace, monospace)' : undefined,
        }}
      >
        {value}
        {copyable && (
          <span
            className="opacity-0 transition-opacity group-hover:opacity-100"
            style={{ flexShrink: 0, color: isCopied ? '#10b981' : 'var(--color-pt-text-3)' }}
          >
            {isCopied ? (
              <Check size={10} strokeWidth={2.5} />
            ) : (
              <Copy size={10} strokeWidth={1.75} />
            )}
          </span>
        )}
      </span>
    </div>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.9px',
        textTransform: 'uppercase',
        color: 'var(--color-pt-text-3)',
        paddingTop: 12,
        paddingBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

export function FeaturePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderBottom: '1px solid var(--color-pt-border)' }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>{label}</span>
      <span
        className="rounded-full px-2 py-0.5"
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          background: ok
            ? 'color-mix(in oklab, #10b981 12%, transparent)'
            : 'color-mix(in oklab, #ef4444 12%, transparent)',
          color: ok ? '#10b981' : '#ef4444',
          border: `1px solid ${
            ok
              ? 'color-mix(in oklab, #10b981 30%, transparent)'
              : 'color-mix(in oklab, #ef4444 30%, transparent)'
          }`,
        }}
      >
        {ok ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

export function SettingChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
      style={{
        fontSize: 10.5,
        background: ok
          ? 'color-mix(in oklab, #10b981 10%, transparent)'
          : 'var(--color-pt-surface-mut)',
        color: ok ? '#10b981' : 'var(--color-pt-text-3)',
        border: `1px solid ${
          ok ? 'color-mix(in oklab, #10b981 25%, transparent)' : 'var(--color-pt-border)'
        }`,
      }}
    >
      <span style={{ fontWeight: 700 }}>{label}:</span>
      <span>{value}</span>
    </span>
  );
}

/**
 * Collapsible drawer section with a header button and a count/status slot.
 * Matches the visual language of the hand-rolled panels in DebugDrawer; used
 * for the migrated environment/storage/audio/transcript panels.
 */
export function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--color-pt-border)',
        overflow: 'hidden',
      }}
    >
      {/* Header is a role="button" div, not a real <button>, so badges may
          contain their own interactive controls (e.g. the storage refresh
          button) without nesting <button> inside <button>. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          width: '100%',
          background: 'var(--color-pt-surface-alt)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
          {title}
        </span>
        {badge}
        <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}
