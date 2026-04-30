import { Mic } from 'lucide-react';
import { SurfaceCard, PtButton } from '@/components/design';
import type { Patient } from '@/types';

export function StartBar({
  patient,
  visitTitle,
  disabled,
  onStart,
}: {
  patient: Patient | undefined;
  visitTitle: string;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <SurfaceCard padding={14}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          {patient ? (
            <>
              Starting{' '}
              <span style={{ color: 'var(--color-pt-text)', fontWeight: 600 }}>
                {patient.firstName} {patient.lastName}
              </span>{' '}
              · {visitTitle.toLowerCase()}
            </>
          ) : (
            <>Pick a patient to continue.</>
          )}
        </p>
        <PtButton
          variant="primary"
          disabled={disabled}
          onClick={onStart}
          iconLeft={<Mic size={14} strokeWidth={2} />}
        >
          Start session
        </PtButton>
      </div>
    </SurfaceCard>
  );
}
