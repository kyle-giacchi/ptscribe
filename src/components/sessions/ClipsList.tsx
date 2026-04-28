import { CheckCircle2, Clock, Loader2, Trash2, XCircle } from 'lucide-react';
import { PlaybackWaveform } from '@/components/audio/PlaybackWaveform';
import { formatDuration, wordCount } from '@/utils/format';
import type { ClipStatus, SessionClip } from '@/types';

export function ClipsList({
  clips,
  recordingDisabled,
  onDeleteClip,
}: {
  clips: SessionClip[];
  recordingDisabled: boolean;
  onDeleteClip: (clipId: string) => void;
}) {
  if (clips.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
        No clips yet. Press <strong>Start recording</strong> to capture audio, or{' '}
        <strong>Upload audio</strong> to add an existing file.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {clips.map((clip, i) => (
        <ClipRow
          key={clip.id}
          clip={clip}
          ordinal={i + 1}
          recordingDisabled={recordingDisabled}
          onDelete={() => onDeleteClip(clip.id)}
        />
      ))}
    </div>
  );
}

function ClipRow({
  clip,
  ordinal,
  recordingDisabled,
  onDelete,
}: {
  clip: SessionClip;
  ordinal: number;
  recordingDisabled: boolean;
  onDelete: () => void;
}) {
  const showWaveform =
    clip.status === 'ready' ||
    clip.status === 'transcribing' ||
    clip.status === 'transcribed' ||
    clip.status === 'failed';
  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        padding: 10,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
          style={{
            background: 'var(--color-pt-surface-alt)',
            color: 'var(--color-pt-text-2)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          {ordinal}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text)' }}>
              Clip {ordinal}
            </span>
            <ClipStatusBadge status={clip.status} />
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: 'var(--color-pt-text-3)' }}
            >
              <Clock size={11} className="-mt-0.5 inline" /> {formatDuration(clip.durationSec)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-pt-text-3)' }}>
              {new Date(clip.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {clip.errorMessage && (
            <p className="mt-1 text-[11px] break-words" style={{ color: 'var(--color-negative)' }}>
              {clip.errorMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Delete clip"
          onClick={onDelete}
          disabled={recordingDisabled || clip.status === 'transcribing'}
          className="transition-colors hover:bg-[var(--color-pt-surface-mut)] disabled:opacity-40"
          style={{
            padding: 6,
            borderRadius: 6,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            color: 'var(--color-pt-red)',
            display: 'inline-flex',
            alignItems: 'center',
            cursor: recordingDisabled || clip.status === 'transcribing' ? 'not-allowed' : 'pointer',
          }}
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
      {showWaveform && (
        <div className="mt-2">
          <PlaybackWaveform audioKey={clip.id} />
        </div>
      )}
      {clip.status === 'transcribed' && clip.transcript && (
        <details className="mt-2">
          <summary
            className="cursor-pointer text-[11px]"
            style={{ color: 'var(--color-pt-text-2)' }}
          >
            View transcript ({wordCount(clip.transcript)} words)
          </summary>
          <p
            className="mt-1 text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--color-pt-text)' }}
          >
            {clip.transcript}
          </p>
        </details>
      )}
    </div>
  );
}

export function ClipStatusBadge({ status }: { status: ClipStatus }) {
  const meta = clipBadgeMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.border}`,
      }}
    >
      {status === 'transcribing' && <Loader2 size={10} className="animate-spin" />}
      {status === 'transcribed' && <CheckCircle2 size={10} />}
      {status === 'failed' && <XCircle size={10} />}
      {meta.label}
    </span>
  );
}

export function clipBadgeMeta(status: ClipStatus): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Recording',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-pt-text-2)',
        border: 'var(--color-pt-border)',
      };
    case 'ready':
      return {
        label: 'Ready',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-pt-text-2)',
        border: 'var(--color-pt-border)',
      };
    case 'transcribing':
      return {
        label: 'Transcribing',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-pt-text)',
        border: 'var(--color-pt-border)',
      };
    case 'transcribed':
      return {
        label: 'Transcribed',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-positive, var(--color-pt-text))',
        border: 'var(--color-positive, var(--color-pt-border))',
      };
    case 'failed':
      return {
        label: 'Failed',
        bg: 'var(--color-pt-surface-alt)',
        fg: 'var(--color-negative)',
        border: 'var(--color-negative)',
      };
  }
}
