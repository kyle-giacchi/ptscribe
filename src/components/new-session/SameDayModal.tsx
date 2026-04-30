import { ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { PtButton } from '@/components/design';
import { labelForType } from '@/utils/labels';
import type { Patient, Session } from '@/types';

export function SameDayModal({
  sessions,
  patient,
  onClose,
  onContinue,
  onCreateNew,
}: {
  sessions: Session[] | null;
  patient: Patient | undefined;
  onClose: () => void;
  onContinue: (sessionId: string) => void;
  onCreateNew: () => void;
}) {
  if (!sessions) return null;
  const name = patient ? `${patient.firstName} ${patient.lastName}` : 'this patient';
  return (
    <Modal open onClose={onClose} title="Session already started today" size="sm">
      <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', margin: 0 }}>
        You have {sessions.length === 1 ? 'an open session' : `${sessions.length} open sessions`}{' '}
        for <strong>{name}</strong> today. Continue where you left off, or start fresh.
      </p>

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        {sessions.map((s) => {
          const time = new Date(s.date).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onContinue(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                border: '1px solid var(--color-pt-accent-border)',
                borderRadius: 10,
                background: 'var(--color-pt-accent-soft)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-accent-fg)' }}>
                  {labelForType(s.type)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)', marginTop: 1 }}>
                  Started at {time}
                </div>
              </div>
              <ExternalLink size={14} color="var(--color-pt-accent)" strokeWidth={2} />
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <PtButton variant="ghost" onClick={onCreateNew}>
          Start new session anyway
        </PtButton>
        {sessions.length === 1 && (
          <PtButton variant="primary" onClick={() => onContinue(sessions[0].id)}>
            Continue session
          </PtButton>
        )}
      </div>
    </Modal>
  );
}
