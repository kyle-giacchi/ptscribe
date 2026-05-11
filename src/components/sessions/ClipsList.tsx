import { useState } from 'react';
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
  const [pendingDelete, setPendingDelete] = useState(false);
  const blocked = recordingDisabled || clip.status === 'transcribing';
  const showWaveform =
    clip.status === 'ready' ||
    clip.status === 'transcribing' ||
    clip.status === 'transcribed' ||
    clip.status === 'failed';

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-3">
        {/* Ordinal badge */}
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            background: 'var(--color-pt-surface-alt)',
            color: 'var(--color-pt-text-2)',
            border: '1px solid var(--color-pt-border)',
          }}
        >
          {ordinal}
        </div>

        {/* Clip info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium" style={{ color: 'var(--color-pt-text)' }}>
              Clip {ordinal}
            </span>
            <ClipStatusBadge status={clip.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span
              className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums"
              style={{ color: 'var(--color-pt-text-3)' }}
            >
              <Clock size={10} />
              {formatDuration(clip.durationSec)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-pt-text-3)' }}>
              {new Date(clip.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {clip.errorMessage && (
            <p
              className="mt-1 break-words text-[11px]"
              style={{ color: 'var(--color-negative)' }}
            >
              {clip.errorMessage}
            </p>
          )}
        </div>

        {/* Delete control */}
        {pendingDelete ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="btn btn-ghost py-0.5 text-xs"
              onClick={() => setPendingDelete(false)}
              style={{ touchAction: 'manipulation' }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-ghost py-0.5 text-xs"
              style={{ color: 'var(--color-negative)', touchAction: 'manipulation' }}
              onClick={() => {
                setPendingDelete(false);
                onDelete();
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Delete clip"
            onClick={() => setPendingDelete(true)}
            disabled={blocked}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-pt-red-soft)] disabled:opacity-40"
            style={{
              color: 'var(--color-pt-red)',
              cursor: blocked ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {showWaveform && (
        <div className="px-3.5 pb-3">
          <PlaybackWaveform audioKey={clip.id} />
        </div>
      )}

      {clip.status === 'transcribed' && clip.transcript && (
        <div
          className="border-t px-3.5 pb-3 pt-2.5"
          style={{ borderColor: 'var(--color-pt-border)' }}
        >
          <details>
            <summary
              className="cursor-pointer select-none text-[11px] font-medium"
              style={{ color: 'var(--color-pt-text-2)' }}
            >
              View transcript ({wordCount(clip.transcript)} words)
            </summary>
            <p
              className="mt-2 whitespace-pre-wrap text-xs leading-relaxed"
              style={{ color: 'var(--color-pt-text)' }}
            >
              {clip.transcript}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

export function ClipStatusBadge({ status }: { status: ClipStatus }) {
  const meta = clipBadgeMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.border}`,
      }}
    >
      {status === 'transcribing' && <Loader2 size={9} className="animate-spin" />}
      {status === 'transcribed' && <CheckCircle2 size={9} />}
      {status === 'failed' && <XCircle size={9} />}
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
        bg: 'var(--color-pt-red-soft)',
        fg: 'var(--color-pt-red-fg)',
        border: 'var(--color-pt-red-border)',
      };
    case 'ready':
      return {
        label: 'Ready',
        bg: 'var(--color-pt-slate-soft)',
        fg: 'var(--color-pt-slate-fg)',
        border: 'var(--color-pt-slate-border)',
      };
    case 'transcribing':
      return {
        label: 'Transcribing',
        bg: 'var(--color-pt-amber-soft)',
        fg: 'var(--color-pt-amber-fg)',
        border: 'var(--color-pt-amber-border)',
      };
    case 'transcribed':
      return {
        label: 'Transcribed',
        bg: 'var(--color-pt-accent-soft)',
        fg: 'var(--color-pt-accent-fg)',
        border: 'var(--color-pt-accent-border)',
      };
    case 'failed':
      return {
        label: 'Failed',
        bg: 'var(--color-pt-red-soft)',
        fg: 'var(--color-pt-red-fg)',
        border: 'var(--color-pt-red-border)',
      };
  }
}
