import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  onUseWebSpeech: () => void;
  onRecordWithoutTranscription: () => void;
  onCancel: () => void;
}

export function WhisperUnavailableDialog({
  open,
  onUseWebSpeech,
  onRecordWithoutTranscription,
  onCancel,
}: Props) {
  return (
    <Modal open={open} onClose={onCancel} title="On-device transcription unavailable" size="sm">
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--color-caution)',
          background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
        }}
      >
        <AlertTriangle
          size={16}
          strokeWidth={2}
          style={{ color: 'var(--color-caution)', flexShrink: 0, marginTop: 1 }}
          aria-hidden="true"
        />
        <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.55, margin: 0 }}>
          We couldn't load the local Whisper model. Your default transcription setting hasn't
          changed — pick how you'd like to handle just this recording.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{
            justifyContent: 'flex-start',
            textAlign: 'left',
            padding: '10px 12px',
            height: 'auto',
            minHeight: 'unset',
          }}
          onClick={onUseWebSpeech}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Use Browser Live Transcription for this session
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              No speaker labels. Default setting unchanged.
            </div>
          </div>
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          style={{
            justifyContent: 'flex-start',
            textAlign: 'left',
            padding: '10px 12px',
            height: 'auto',
            minHeight: 'unset',
          }}
          onClick={onRecordWithoutTranscription}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Record now, transcribe later</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              Audio saves to this session. Transcribe from the Review tab later.
            </div>
          </div>
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          borderTop: '1px solid var(--color-pt-border, rgba(127,127,127,0.18))',
          paddingTop: 10,
          marginTop: 4,
        }}
      >
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
