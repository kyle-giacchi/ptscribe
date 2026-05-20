import { AlertTriangle } from 'lucide-react';

interface RecordWarningBannerProps {
  onBackToReview: () => void;
  onDismiss: () => void;
}

export function RecordWarningBanner({ onBackToReview, onDismiss }: RecordWarningBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid var(--color-caution)',
        background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
      }}
    >
      <AlertTriangle
        size={15}
        strokeWidth={2}
        style={{ color: 'var(--color-caution)', flexShrink: 0, marginTop: 1 }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-fg)',
            marginBottom: 4,
          }}
        >
          Recording more will invalidate your generated note
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)', lineHeight: 1.55 }}>
          Any new clips will be added to your transcript, but your note was generated from
          the previous transcript. You&apos;ll need to re-run transcription and regenerate
          before the note reflects this recording.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={onBackToReview}>
          Back to Review
        </button>
        <button type="button" className="btn btn-ghost py-1 text-xs" onClick={onDismiss}>
          Keep recording
        </button>
      </div>
    </div>
  );
}
