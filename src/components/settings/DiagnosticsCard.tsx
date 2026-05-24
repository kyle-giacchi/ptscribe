import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';

export function DiagnosticsCard() {
  const navigate = useNavigate();

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Eyebrow>Diagnostics</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Re-run the pre-flight setup checks — browser support, microphone, on-device model, and
          storage. Useful when audio capture or transcription isn&apos;t working.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <PtButton
            variant="ghost"
            iconLeft={<Activity size={14} strokeWidth={2} />}
            onClick={() => navigate('/setup-check?return=/settings')}
          >
            Run diagnostics
          </PtButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
