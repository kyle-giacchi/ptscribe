import { Mic, Pencil } from 'lucide-react';
import { Avatar, PtButton, StatusBadge, type StatusTone } from '@/components/design';
import { labelForSex } from '@/utils/patientMetrics';
import type { Patient } from '@/types';

/**
 * Record tabs. Every one of these is backed by real data — the former
 * `documents` and `billing` tabs were removed rather than left as placeholders,
 * because neither has a type, a schema, or a store behind it.
 */
export type Tab = 'overview' | 'visits' | 'measures' | 'plan';
export const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'visits', label: 'Visits' },
  { value: 'measures', label: 'Measures' },
  { value: 'plan', label: 'Plan of care' },
];

export const DEFAULT_TAB: Tab = 'overview';

/** Narrow an untrusted `:tab` URL segment; anything unknown falls back to Overview. */
export function parseTab(segment: string | undefined): Tab {
  return TABS.find((t) => t.value === segment)?.value ?? DEFAULT_TAB;
}

export function PatientHeader({
  patient,
  age,
  fullName,
  subtitle,
  status,
  tab,
  onTab,
  onEdit,
  onStartSession,
  counts,
}: {
  patient: Patient;
  age: number | null;
  fullName: string;
  subtitle: string;
  status: { tone: StatusTone; label: string };
  tab: Tab;
  onTab: (t: Tab) => void;
  onEdit: () => void;
  onStartSession: () => void;
  /** Per-tab item counts. Omitted or zero renders no badge. */
  counts?: Partial<Record<Tab, number>>;
}) {
  const idLine = [
    `PT-${patient.id.slice(0, 5).toUpperCase()}`,
    age !== null ? `${age} yo` : null,
    patient.sex ? labelForSex(patient.sex) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '20px 22px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <Avatar name={fullName || '?'} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.3px',
                color: 'var(--color-pt-text)',
              }}
            >
              {fullName || 'Unnamed patient'}
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-pt-text-3)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {idLine}
            </span>
            <StatusBadge tone={status.tone} label={status.label} />
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-pt-text-2)',
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <PtButton
            variant="ghost"
            iconLeft={<Pencil size={14} strokeWidth={2} />}
            onClick={onEdit}
          >
            Edit
          </PtButton>
          <PtButton
            variant="primary"
            iconLeft={<Mic size={14} strokeWidth={2} />}
            onClick={onStartSession}
          >
            Start session
          </PtButton>
        </div>
      </div>

      <div
        role="tablist"
        className="[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ display: 'flex', gap: 22, marginTop: 18, overflowX: 'auto' }}
      >
        {TABS.map((t) => {
          const active = tab === t.value;
          const count = counts?.[t.value] ?? 0;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(t.value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 0',
                border: 'none',
                background: 'transparent',
                borderBottom: `2px solid ${active ? 'var(--color-pt-accent)' : 'transparent'}`,
                color: active ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: 'var(--color-pt-surface-mut)',
                    border: '1px solid var(--color-pt-border)',
                    color: 'var(--color-pt-text-3)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
