import { Avatar } from '@/components/design';
import { Check } from 'lucide-react';
import type { Patient } from '@/types';

export function PatientRow({
  patient,
  selected,
  onSelect,
}: {
  patient: Patient;
  selected: boolean;
  onSelect: () => void;
}) {
  const displayName = patient.lastName
    ? `${patient.lastName}, ${patient.firstName}`
    : patient.firstName;
  return (
    <li style={{ borderBottom: '1px solid var(--color-pt-border)' }}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 16px',
          border: 'none',
          background: selected ? 'var(--color-pt-accent-soft)' : 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          minHeight: 52,
          transition: 'background 120ms ease',
          boxSizing: 'border-box',
        }}
      >
        <Avatar name={`${patient.firstName} ${patient.lastName}`} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </div>
          {patient.primaryDiagnosis && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-pt-text-3)',
                marginTop: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {patient.primaryDiagnosis}
            </div>
          )}
        </div>
        {selected && (
          <Check size={15} strokeWidth={2.5} style={{ flexShrink: 0, color: 'var(--color-pt-accent)' }} />
        )}
      </button>
    </li>
  );
}
