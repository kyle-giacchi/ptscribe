import { useState, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Info,
  ArrowRight,
  X,
} from 'lucide-react';
import { formatDuration } from '@/utils/format';
import { useSettings } from '@/contexts/SettingsProvider';
import { ClipsList } from '@/components/sessions/ClipsList';
import { AudioPreviewSection } from './AudioPreviewSection';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseLiveTranscript } from '@/hooks/useLiveTranscript';
import type { SessionClip } from '@/types';

export interface RecordingPanelProps {
  recorder: UseRecorder;
  live: UseLiveTranscript;
  clips: SessionClip[];
  onStart: () => void;
  onStop: () => void;
  onStopAndFinish: () => void;
  autoFinish: boolean;
  onPauseResume: () => void;
  onDeleteClip: (clipId: string) => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
  onRecordingComplete: () => void;
  isMerging: boolean;
  mergedAudioBlob: Blob | null;
  wasBackgrounded: boolean;
  onDismissBackgroundWarning: () => void;
}

// ── Shared banner for all status/warning/info notices ─────────────────────────
function StatusBanner({
  icon,
  color,
  children,
  action,
  onDismiss,
}: {
  icon: ReactNode;
  color: 'caution' | 'negative' | 'info';
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const tokens =
    color === 'caution'
      ? {
          border: 'var(--color-pt-amber-border)',
          accent: 'var(--color-pt-amber)',
          bg: 'color-mix(in oklab, var(--color-pt-amber) 8%, var(--color-pt-surface))',
          fg: 'var(--color-pt-amber-fg)',
        }
      : color === 'negative'
        ? {
            border: 'var(--color-pt-red-border)',
            accent: 'var(--color-pt-red)',
            bg: 'color-mix(in oklab, var(--color-pt-red) 6%, var(--color-pt-surface))',
            fg: 'var(--color-pt-red-fg)',
          }
        : {
            border: 'var(--color-pt-accent-border)',
            accent: 'var(--color-pt-accent)',
            bg: 'color-mix(in oklab, var(--color-pt-accent) 7%, var(--color-pt-surface))',
            fg: 'var(--color-pt-accent-fg)',
          };

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-xs"
      style={{
        borderTop: `1px solid ${tokens.border}`,
        borderRight: `1px solid ${tokens.border}`,
        borderBottom: `1px solid ${tokens.border}`,
        borderLeft: `3px solid ${tokens.accent}`,
        background: tokens.bg,
        color: tokens.fg,
      }}
    >
      <span style={{ marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span className="flex-1 leading-relaxed">{children}</span>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-1 flex shrink-0 items-center justify-center rounded transition-opacity hover:opacity-70"
          style={{
            color: tokens.fg,
            minHeight: 24,
            minWidth: 24,
            touchAction: 'manipulation',
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Idle entry point — no clips yet ───────────────────────────────────────────
function RecordingBlankOptions({
  onStart,
  onUpload,
  onSkip,
}: {
  onStart: () => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8 px-4 py-12">
      {/* Mic button with breathing ring */}
      <div className="relative flex items-center justify-center">
        <span
          className="absolute animate-ping rounded-full"
          style={{
            width: 120,
            height: 120,
            background: 'color-mix(in oklab, var(--color-pt-accent) 16%, transparent)',
            animationDuration: '2.4s',
          }}
        />
        <button
          type="button"
          onClick={onStart}
          aria-label="Start recording"
          className="relative flex items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2"
          style={{
            width: 96,
            height: 96,
            background: 'var(--color-pt-accent)',
            boxShadow: '0 8px 28px color-mix(in oklab, var(--color-pt-accent) 38%, transparent)',
            touchAction: 'manipulation',
          }}
        >
          <Mic size={38} strokeWidth={1.75} color="#ffffff" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-base font-semibold" style={{ color: 'var(--color-pt-text)' }}>
          Tap to start recording
        </p>
        <p
          className="max-w-[280px] text-sm leading-relaxed"
          style={{ color: 'var(--color-pt-text-2)' }}
        >
          Capture the session in real time, or upload an existing audio file
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className="btn btn-secondary cursor-pointer" style={{ touchAction: 'manipulation' }}>
          <Upload size={14} strokeWidth={2} /> Upload audio
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(file);
                e.target.value = '';
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onSkip}
          style={{ touchAction: 'manipulation' }}
        >
          Skip <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ── Active recording state ─────────────────────────────────────────────────────
function ActiveRecordingCard({
  durationSec,
  paused,
  chainActive,
  autoFinish,
  onPauseResume,
  onStop,
  onStopAndFinish,
}: {
  durationSec: number;
  paused: boolean;
  chainActive: boolean;
  autoFinish: boolean;
  onPauseResume: () => void;
  onStop: () => void;
  onStopAndFinish: () => void;
}) {
  const accentColor = paused ? 'var(--color-pt-amber)' : 'var(--color-pt-red)';
  const accentBorder = paused ? 'var(--color-pt-amber-border)' : 'var(--color-pt-red-border)';
  const accentFg = paused ? 'var(--color-pt-amber-fg)' : 'var(--color-pt-red-fg)';
  const accentBg = paused
    ? 'color-mix(in oklab, var(--color-pt-amber) 5%, var(--color-pt-surface))'
    : 'color-mix(in oklab, var(--color-pt-red) 5%, var(--color-pt-surface))';

  return (
    <div
      className="rounded-xl"
      style={{
        borderTop: `1px solid ${accentBorder}`,
        borderRight: `1px solid ${accentBorder}`,
        borderBottom: `1px solid ${accentBorder}`,
        borderLeft: `4px solid ${accentColor}`,
        background: accentBg,
        padding: '18px 20px',
      }}
    >
      {/* Status row */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex items-center gap-2">
          <span className="relative flex h-3 w-3 shrink-0">
            {!paused && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-65"
                style={{ background: accentColor }}
              />
            )}
            <span
              className="relative inline-flex h-3 w-3 rounded-full"
              style={{ background: accentColor }}
            />
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: accentFg }}
          >
            {paused ? 'Paused' : 'Recording'}
          </span>
        </span>
        <span
          className="ml-auto font-mono text-3xl font-semibold tabular-nums"
          style={{ color: 'var(--color-pt-text)', letterSpacing: '-0.02em' }}
        >
          {formatDuration(durationSec)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onPauseResume}
          disabled={chainActive}
          style={{ minHeight: 44, touchAction: 'manipulation' }}
        >
          {paused ? (
            <>
              <Play size={15} strokeWidth={2} /> Resume
            </>
          ) : (
            <>
              <Pause size={15} strokeWidth={2} /> Pause
            </>
          )}
        </button>
        {autoFinish ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStopAndFinish}
              disabled={chainActive}
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              <Square size={15} strokeWidth={2} /> Stop &amp; finish
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onStop}
              disabled={chainActive}
              title="Stop without auto-transcribing or generating"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              Stop only
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStop}
            disabled={chainActive}
            style={{ minHeight: 44, touchAction: 'manipulation' }}
          >
            <Square size={15} strokeWidth={2} /> Stop
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add-another-clip row (shown when clips exist and recorder is idle) ─────────
function ClipsActionRow({
  onStart,
  onUpload,
}: {
  onStart: () => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-3"
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-alt)',
      }}
    >
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onStart}
        style={{ touchAction: 'manipulation' }}
      >
        <Mic size={14} strokeWidth={2} /> Add clip
      </button>
      <label className="btn btn-ghost cursor-pointer" style={{ touchAction: 'manipulation' }}>
        <Upload size={14} strokeWidth={2} /> Upload audio
        <input
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUpload(file);
              e.target.value = '';
            }
          }}
        />
      </label>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function RecordingPanel({
  recorder,
  live,
  clips,
  onStart,
  onStop,
  onStopAndFinish,
  autoFinish,
  onPauseResume,
  onDeleteClip,
  onUpload,
  onSkip,
  onRecordingComplete,
  isMerging,
  mergedAudioBlob,
  wasBackgrounded,
  onDismissBackgroundWarning,
}: RecordingPanelProps) {
  const { settings } = useSettings();
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const idle =
    recorder.status === 'idle' || recorder.status === 'stopped' || recorder.status === 'error';
  const webspeechProvider = settings.ai.transcription.provider === 'webspeech';

  const [wasAutoStopped, setWasAutoStopped] = useState(false);

  useEffect(() => {
    if (recorder.hardCapStopped) {
      toast.warning(
        `Hit recording length cap (${settings.recordingLimits.maxMinutes} min) — auto-stopped.`,
      );
    }
  }, [recorder.hardCapStopped, settings.recordingLimits.maxMinutes]);

  useEffect(() => {
    if (recorder.idleAutoStopped) {
      setWasAutoStopped(true);
    }
  }, [recorder.idleAutoStopped]);

  useEffect(() => {
    if (recorder.status === 'recording') {
      setWasAutoStopped(false);
    }
  }, [recorder.status]);

  if (idle && clips.length === 0) {
    return <RecordingBlankOptions onStart={onStart} onUpload={onUpload} onSkip={onSkip} />;
  }

  return (
    <div className="space-y-3">
      {wasBackgrounded && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="caution"
          onDismiss={onDismissBackgroundWarning}
        >
          This tab was backgrounded during recording. Audio kept saving, but on mobile the OS may
          have paused or trimmed the clip. Verify duration after stopping.
        </StatusBanner>
      )}

      {wasAutoStopped && !recording && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="caution"
          action={
            <button
              type="button"
              className="btn btn-ghost shrink-0 py-0.5 text-xs font-medium"
              style={{ color: 'var(--color-pt-amber-fg)', touchAction: 'manipulation' }}
              onClick={() => {
                setWasAutoStopped(false);
                void onStart();
              }}
            >
              Resume
            </button>
          }
          onDismiss={() => setWasAutoStopped(false)}
        >
          Recording auto-stopped after {settings.recordingLimits.idleAutoStopMinutes} min of
          inactivity.
        </StatusBanner>
      )}

      {recording ? (
        <ActiveRecordingCard
          durationSec={recorder.durationSec}
          paused={recorder.status === 'paused'}
          chainActive={false}
          autoFinish={autoFinish}
          onPauseResume={onPauseResume}
          onStop={onStop}
          onStopAndFinish={onStopAndFinish}
        />
      ) : (
        <ClipsActionRow onStart={onStart} onUpload={onUpload} />
      )}

      {recording && <RecordingSizeHint durationSec={recorder.durationSec} />}

      {recording && recorder.softWarnReached && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
          This take has been recording for {Math.round(recorder.durationSec / 60)} min — consider
          stopping and starting a fresh clip. Auto-stop at {settings.recordingLimits.maxMinutes}{' '}
          min.
        </StatusBanner>
      )}

      <RecordingNotices
        recorderError={recorder.error}
        webspeechProvider={webspeechProvider}
        liveSupported={live.supported}
        liveError={live.error}
        hasFailedClip={clips.some((c) => c.status === 'failed')}
      />

      <ClipsList clips={clips} recordingDisabled={recording} onDeleteClip={onDeleteClip} />

      {idle && clips.length > 0 && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            className="btn btn-primary w-full sm:w-auto"
            disabled={isMerging}
            onClick={onRecordingComplete}
            style={{ minHeight: 44, touchAction: 'manipulation' }}
          >
            {isMerging ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Combining clips…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} strokeWidth={2} /> Recording Complete
              </>
            )}
          </button>
        </div>
      )}

      {mergedAudioBlob && <AudioPreviewSection mergedAudioBlob={mergedAudioBlob} />}

      <LiveTranscriptPreview live={live} />
    </div>
  );
}

// ── Estimated file size hint ───────────────────────────────────────────────────
const ESTIMATED_BYTES_PER_SEC = 8 * 1024;
const WHISPER_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const WARN_THRESHOLD_BYTES = 20 * 1024 * 1024;

function RecordingSizeHint({ durationSec }: { durationSec: number }) {
  const estimatedBytes = durationSec * ESTIMATED_BYTES_PER_SEC;
  const estimatedMb = estimatedBytes / (1024 * 1024);
  const approachingCap = estimatedBytes >= WARN_THRESHOLD_BYTES;
  const overCap = estimatedBytes >= WHISPER_UPLOAD_LIMIT_BYTES;

  if (overCap) {
    return (
      <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
        Estimated ~{estimatedMb.toFixed(1)} MB — past the 25 MB Whisper upload limit. Stop and
        start a new clip.
      </StatusBanner>
    );
  }
  if (approachingCap) {
    return (
      <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
        Estimated ~{estimatedMb.toFixed(1)} MB of 25 MB. Consider stopping &amp; starting a new
        clip soon.
      </StatusBanner>
    );
  }
  return (
    <div
      className="rounded-md px-3 py-1.5 text-[11px]"
      style={{
        border: '1px solid var(--color-pt-border)',
        color: 'var(--color-pt-text-3)',
      }}
    >
      Estimated ~{estimatedMb.toFixed(1)} MB recorded (Whisper accepts up to 25 MB per clip).
    </div>
  );
}

function RecordingNotices({
  recorderError,
  webspeechProvider,
  liveSupported,
  liveError,
  hasFailedClip,
}: {
  recorderError: string | null;
  webspeechProvider: boolean;
  liveSupported: boolean;
  liveError: string | null;
  hasFailedClip: boolean;
}) {
  return (
    <>
      {webspeechProvider && (
        <div
          className="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{
            background: 'var(--color-pt-accent-soft)',
            color: 'var(--color-pt-accent-fg)',
            border: '1px solid var(--color-pt-accent-border)',
          }}
        >
          <CheckCircle2 size={10} strokeWidth={2.5} />
          Local Transcription Enabled
        </div>
      )}
      {recorderError && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          {recorderError}
        </StatusBanner>
      )}
      {hasFailedClip && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
          One or more clips failed to transcribe. Open the Transcription step to retry.
        </StatusBanner>
      )}
      {webspeechProvider && !liveSupported && (
        <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
          This browser doesn&apos;t support live transcription. Switch transcription to Cloudflare
          in Settings to transcribe recordings.
        </StatusBanner>
      )}
      {webspeechProvider && liveSupported && (
        <p className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
          Browser transcription can&apos;t tell speakers apart, which can muddle the generated note.
          Upgrade to Cloudflare Nova-3 for speaker labeling.
        </p>
      )}
      {webspeechProvider && liveSupported && liveError && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          Live transcription error: {liveError}. {liveErrorHint(liveError)}
        </StatusBanner>
      )}
    </>
  );
}

function liveErrorHint(err: string): string {
  switch (err) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was blocked for speech recognition.';
    case 'no-speech':
      return 'No speech was detected.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'Browser speech recognition needs an internet connection.';
    default:
      return 'Switch to Cloudflare in Settings to transcribe saved clips instead.';
  }
}

// ── Live transcript overlay ────────────────────────────────────────────────────
function LiveTranscriptPreview({ live }: { live: UseLiveTranscript }) {
  if (!(live.listening || live.interimText || live.finalText)) return null;
  return (
    <div
      className="rounded-lg px-3.5 py-2.5 text-xs"
      style={{
        border: '1px solid var(--color-pt-accent-border)',
        background: 'var(--color-pt-accent-soft)',
        color: 'var(--color-pt-text-2)',
      }}
    >
      <span className="font-semibold" style={{ color: 'var(--color-pt-accent-fg)' }}>
        Live:{' '}
      </span>
      <span style={{ color: 'var(--color-pt-text)' }}>{live.finalText}</span>
      {live.interimText && (
        <span className="italic" style={{ color: 'var(--color-pt-text-3)' }}>
          {' '}
          {live.interimText}
        </span>
      )}
    </div>
  );
}
