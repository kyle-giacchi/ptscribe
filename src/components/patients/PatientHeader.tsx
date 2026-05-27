import { Mic, Pencil, Calendar, MessageSquare } from 'lucide-react';
import {
  Avatar,
  ComingSoonChip,
  PtButton,
  StatusBadge,
  type StatusTone,
} from '@/components/design';
import { labelForSex } from '@/utils/patientMetrics';
import type { Patient } from '@/types';

export type Tab = 'overview' | 'history' | 'measures' | 'hep' | 'documents' | 'billing';
export const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'history', label: 'History' },
  { value: 'measures', label: 'Measures' },
  { value: 'hep', label: 'HEP' },
  { value: 'documents', label: 'Documents' },
  { value: 'billing', label: 'Billing' },
];

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
            iconLeft={<MessageSquare size={14} strokeWidth={2} />}
            iconRight={<ComingSoonChip />}
            disabled
            title="Coming soon"
          >
            Message
          </PtButton>
          <PtButton
            variant="ghost"
            iconLeft={<Calendar size={14} strokeWidth={2} />}
            iconRight={<ComingSoonChip />}
            disabled
            title="Coming soon"
          >
            Schedule
          </PtButton>
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
        className="[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ display: 'flex', gap: 22, marginTop: 18, overflowX: 'auto' }}
      >
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onTab(t.value)}
              style={{
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
