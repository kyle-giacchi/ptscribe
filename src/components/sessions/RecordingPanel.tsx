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
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { Select, TextInput } from '@/components/ui/Field';
import { PlaybackWaveform } from '@/components/audio/PlaybackWaveform';
import { BlobWaveform } from '@/components/audio/BlobWaveform';
import { ClipsList } from '@/components/sessions/ClipsList';
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
    <div className="flex flex-col items-center gap-5 py-8">
      <button
        type="button"
        onClick={onStart}
        aria-label="Start recording"
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'var(--color-pt-accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 0 0 var(--color-pt-accent)',
          transition: 'transform 120ms ease-out, box-shadow 120ms ease-out',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 0 0 8px color-mix(in oklab, var(--color-pt-accent) 20%, transparent)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 0 var(--color-pt-accent)';
        }}
        onMouseDown={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
        }}
      >
        <Mic size={34} strokeWidth={2} color="#ffffff" />
      </button>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-pt-text)' }}>
          Tap to start recording
        </p>
        <p className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
          Or upload an existing audio file
        </p>
      </div>
      <div className="flex items-center gap-2">
        <label className="btn btn-secondary cursor-pointer text-sm">
          <Upload size={13} strokeWidth={2} /> Upload
          <input
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(file);
                e.target.value = '';
              }
            }}
          />
        </label>
        <button type="button" className="btn btn-ghost text-sm" onClick={onSkip}>
          Skip <ArrowRight size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

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
  return (
    <div
      className="rounded-xl border"
      style={{
        borderColor: paused
          ? 'var(--color-pt-border)'
          : 'color-mix(in oklab, var(--color-pt-red) 25%, var(--color-pt-border))',
        background: paused
          ? 'var(--color-pt-surface-alt)'
          : 'color-mix(in oklab, var(--color-pt-red) 4%, var(--color-pt-surface))',
        padding: '16px 20px',
      }}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {!paused && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: 'var(--color-pt-red)' }}
            />
          )}
          <span
            className="relative inline-flex h-2.5 w-2.5 rounded-full"
            style={{ background: paused ? 'var(--color-pt-text-3)' : 'var(--color-pt-red)' }}
          />
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-widest"
          style={{ color: paused ? 'var(--color-pt-text-2)' : 'var(--color-pt-red)' }}
        >
          {paused ? 'Paused' : 'Recording'}
        </span>
        <span
          className="font-mono text-2xl font-semibold tabular-nums"
          style={{ color: 'var(--color-pt-text)', marginLeft: 'auto' }}
        >
          {formatDuration(durationSec)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ActiveRecordingControls
          paused={paused}
          onPauseResume={onPauseResume}
          onStop={onStop}
          onStopAndFinish={onStopAndFinish}
          autoFinish={autoFinish}
          chainActive={chainActive}
        />
      </div>
    </div>
  );
}

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

  // Persistent banner flag: set when idle-auto-stop fires, cleared when the PT
  // resumes recording or explicitly dismisses the notice.
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

  // Clear the banner the moment a new recording begins.
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
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-caution)',
            color: 'var(--color-caution)',
            background: 'color-mix(in oklab, var(--color-caution) 10%, transparent)',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>
              This tab was backgrounded during recording. Audio kept saving, but on mobile the OS
              may have paused or trimmed the clip. Verify duration after stopping.
            </span>
          </div>
          <button
            type="button"
            onClick={onDismissBackgroundWarning}
            className="btn btn-ghost shrink-0 py-0.5 text-xs"
            style={{ color: 'var(--color-caution)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {wasAutoStopped && !recording && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-caution)',
            color: 'var(--color-caution)',
            background: 'color-mix(in oklab, var(--color-caution) 10%, transparent)',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>
              Recording auto-stopped after {settings.recordingLimits.idleAutoStopMinutes} min of
              inactivity. Tap <strong>Resume</strong> to start a new clip.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost shrink-0 py-0.5 text-xs"
              style={{ color: 'var(--color-caution)' }}
              onClick={() => {
                setWasAutoStopped(false);
                void onStart();
              }}
            >
              Resume
            </button>
            <button
              type="button"
              className="btn btn-ghost shrink-0 p-0.5"
              aria-label="Dismiss auto-stop notice"
              style={{ color: 'var(--color-caution)' }}
              onClick={() => setWasAutoStopped(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
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
        <RecordingControlRow
          idle={idle}
          recording={false}
          paused={false}
          onStart={onStart}
          onPauseResume={onPauseResume}
          onStop={onStop}
          onStopAndFinish={onStopAndFinish}
          autoFinish={autoFinish}
          chainActive={false}
          onUpload={onUpload}
        />
      )}

      {recording && <RecordingSizeHint durationSec={recorder.durationSec} />}

      {recording && recorder.softWarnReached && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-caution)',
            color: 'var(--color-caution)',
            background: 'color-mix(in oklab, var(--color-caution) 10%, transparent)',
          }}
        >
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
          <span>
            This take has been recording for {Math.round(recorder.durationSec / 60)} min — consider
            stopping and starting a fresh clip to keep things manageable. Auto-stop at{' '}
            {settings.recordingLimits.maxMinutes} min.
          </span>
        </div>
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
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={isMerging}
            onClick={onRecordingComplete}
          >
            {isMerging ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Combining clips…
              </>
            ) : (
              <>
                <CheckCircle2 size={14} strokeWidth={2} /> Recording Complete
              </>
            )}
          </button>
        </div>
      )}

      {!recording && <AudioPreviewSection clips={clips} mergedAudioBlob={mergedAudioBlob} />}

      <LiveTranscriptPreview live={live} />
    </div>
  );
}

function RecordingControlRow({
  idle,
  paused,
  onStart,
  onPauseResume,
  onStop,
  onStopAndFinish,
  autoFinish,
  chainActive,
  onUpload,
}: {
  idle: boolean;
  recording: boolean;
  paused: boolean;
  onStart: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onStopAndFinish: () => void;
  autoFinish: boolean;
  chainActive: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {idle ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={onStart}>
            <Mic size={14} strokeWidth={2} /> Add clip
          </button>
          <label className="btn btn-ghost cursor-pointer">
            <Upload size={14} strokeWidth={2} /> Upload audio
            <input
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUpload(file);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </>
      ) : (
        <ActiveRecordingControls
          paused={paused}
          onPauseResume={onPauseResume}
          onStop={onStop}
          onStopAndFinish={onStopAndFinish}
          autoFinish={autoFinish}
          chainActive={chainActive}
        />
      )}
    </div>
  );
}

// Whisper's upload endpoint accepts up to 25 MB. We don't know the exact
// per-second byte rate of the live recorder (Opus mono ≈ 4 KB/s, but some
// browsers default to higher bitrates), so estimate conservatively at 8 KB/s
// and warn well before the cap.
const ESTIMATED_BYTES_PER_SEC = 8 * 1024;
const WHISPER_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const WARN_THRESHOLD_BYTES = 20 * 1024 * 1024;

function RecordingSizeHint({ durationSec }: { durationSec: number }) {
  const estimatedBytes = durationSec * ESTIMATED_BYTES_PER_SEC;
  const estimatedMb = estimatedBytes / (1024 * 1024);
  const approachingCap = estimatedBytes >= WARN_THRESHOLD_BYTES;
  const overCap = estimatedBytes >= WHISPER_UPLOAD_LIMIT_BYTES;

  const tone = overCap
    ? {
        color: 'var(--color-caution)',
        bg: 'color-mix(in oklab, var(--color-caution) 10%, transparent)',
        border: 'var(--color-caution)',
      }
    : approachingCap
      ? {
          color: 'var(--color-pt-accent-fg)',
          bg: 'color-mix(in oklab, var(--color-pt-accent) 10%, transparent)',
          border: 'var(--color-pt-accent-border)',
        }
      : {
          color: 'var(--color-fg-subtle)',
          bg: 'transparent',
          border: 'var(--color-pt-border)',
        };

  const message = overCap
    ? `Estimated ~${estimatedMb.toFixed(1)} MB — past the 25 MB Whisper upload limit. Stop and start a new clip.`
    : approachingCap
      ? `Estimated ~${estimatedMb.toFixed(1)} MB of 25 MB. Consider stopping & starting a new clip soon.`
      : `Estimated ~${estimatedMb.toFixed(1)} MB recorded (Whisper accepts up to 25 MB per clip).`;

  return (
    <div
      role="status"
      className="rounded-md border px-3 py-1.5 text-[11px]"
      style={{ color: tone.color, background: tone.bg, borderColor: tone.border }}
    >
      {message}
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
      {recorderError && (
        <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
          {recorderError}
        </p>
      )}
      {hasFailedClip && (
        <p className="text-xs" style={{ color: 'var(--color-caution)' }}>
          One or more clips failed to transcribe. Open the Transcription step to retry.
        </p>
      )}
      {webspeechProvider && !liveSupported && (
        <p className="text-xs" style={{ color: 'var(--color-caution)' }}>
          This browser doesn't support live transcription. Switch transcription to Cloudflare in
          Settings to transcribe recordings.
        </p>
      )}
      {webspeechProvider && liveSupported && (
        <p className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
          Browser transcription can't tell speakers apart, which can muddle the generated note when
          the patient and clinician both talk. Upgrade to Cloudflare Nova-3 for speaker labeling.
        </p>
      )}
      {webspeechProvider && liveSupported && liveError && (
        <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
          Live transcription error: {liveError}. {liveErrorHint(liveError)}
        </p>
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

function ActiveRecordingControls({
  paused,
  onPauseResume,
  onStop,
  onStopAndFinish,
  autoFinish,
  chainActive,
}: {
  paused: boolean;
  onPauseResume: () => void;
  onStop: () => void;
  onStopAndFinish: () => void;
  autoFinish: boolean;
  chainActive: boolean;
}) {
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onPauseResume}
        disabled={chainActive}
      >
        {paused ? (
          <>
            <Play size={14} strokeWidth={2} /> Resume
          </>
        ) : (
          <>
            <Pause size={14} strokeWidth={2} /> Pause
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
          >
            <Square size={14} strokeWidth={2} /> Stop &amp; finish
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onStop}
            disabled={chainActive}
            title="Stop without auto-transcribing or generating"
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
        >
          <Square size={14} strokeWidth={2} /> Stop
        </button>
      )}
    </>
  );
}

function AudioTrackRow({
  label,
  savedSec,
  note,
  children,
}: {
  label: string;
  savedSec?: number | null;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface-alt)',
        padding: 10,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="text-[11px] font-semibold tracking-wide uppercase"
          style={{ color: 'var(--color-pt-text-2)' }}
        >
          {label}
        </span>
        {savedSec != null && savedSec > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: 'color-mix(in oklab, var(--color-pt-accent) 12%, transparent)',
              color: 'var(--color-pt-accent-fg)',
              border: '1px solid var(--color-pt-accent-border)',
            }}
          >
            −{savedSec.toFixed(1)}s saved
          </span>
        )}
        {note && (
          <span className="text-[10px]" style={{ color: 'var(--color-pt-text-3)' }}>
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function AudioPreviewSection({
  clips,
  mergedAudioBlob,
}: {
  clips: SessionClip[];
  mergedAudioBlob: Blob | null;
}) {
  const { settings, updateAudio } = useSettings();
  const playableClips = clips.filter(
    (c) => c.status === 'ready' || c.status === 'transcribing' || c.status === 'transcribed',
  );

  const [selectedId, setSelectedId] = useState<string>('');

  const activeId = playableClips.some((c) => c.id === selectedId)
    ? selectedId
    : (playableClips.at(-1)?.id ?? '');

  // Pin selection once the first clip appears so subsequent uploads
  // don't auto-jump the view and wipe compiled silence/speed results.
  useEffect(() => {
    if (!selectedId && activeId) setSelectedId(activeId);
  }, [activeId, selectedId]);

  const {
    activeSilenced,
    activeSpedup,
    compilingSilence,
    compilingSpeed,
    activeSilenceError,
    activeSpeedError,
    compileSilence,
    compileSpeed,
    resetSilence,
    resetSpeed,
  } = useAudioProcessing(activeId);

  if (playableClips.length === 0) return null;

  const sd = settings.audio.silenceDetection;
  const su = settings.audio.speedUp;
  const ordinalOf = (clipId: string) => clips.findIndex((c) => c.id === clipId) + 1;

  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: 'var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        padding: 12,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-pt-text)' }}>
          {mergedAudioBlob ? 'Combined Audio' : 'Audio Preview'}
        </span>
        {!mergedAudioBlob && (
          <select
            value={activeId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={playableClips.length <= 1}
            style={{
              background: 'var(--color-pt-surface-alt)',
              color: 'var(--color-pt-text)',
              border: '1px solid var(--color-pt-border)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
              cursor: playableClips.length > 1 ? 'pointer' : 'default',
              opacity: playableClips.length <= 1 ? 0.6 : 1,
            }}
          >
            {playableClips.map((c) => (
              <option key={c.id} value={c.id}>
                Clip {ordinalOf(c.id)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {/* Full audio track */}
        <AudioTrackRow label="Full Audio">
          {mergedAudioBlob ? (
            <BlobWaveform blob={mergedAudioBlob} />
          ) : activeId ? (
            <PlaybackWaveform audioKey={activeId} />
          ) : null}
        </AudioTrackRow>

        {/* Silence trimming — toggle + settings + result all in one card */}
        <AudioTrackRow label="Silence Removed" savedSec={activeSilenced?.savedSec}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={sd.enabled}
                  onChange={(e) =>
                    updateAudio({ silenceDetection: { ...sd, enabled: e.target.checked } })
                  }
                />
                <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text-2)' }}>
                  Silence trimming
                </span>
              </label>
              <button
                type="button"
                className="btn btn-ghost p-0.5"
                aria-label="About silence trimming"
                title={
                  'Removes quiet gaps before transcription. The original recording is never changed.\n\n' +
                  'Sensitivity:\n' +
                  '  • Aggressive — best for long dead-air gaps.\n' +
                  '  • Balanced — recommended for most PT sessions.\n' +
                  '  • Relaxed — only drops very long, obvious silences.\n\n' +
                  'Pad (ms) keeps audio around speech edges to avoid clipping words. Try 400–600 ms if sentences are cut off.'
                }
                style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
              >
                <Info size={13} />
              </button>
              {sd.enabled && (
                <>
                  <label className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>
                      Sensitivity
                    </span>
                    <Select
                      value={sd.sensitivity}
                      className="h-7 py-0 text-xs"
                      onChange={(e) =>
                        updateAudio({
                          silenceDetection: {
                            ...sd,
                            sensitivity: e.target.value as 'low' | 'medium' | 'high',
                          },
                        })
                      }
                    >
                      <option value="low">Aggressive</option>
                      <option value="medium">Balanced</option>
                      <option value="high">Relaxed</option>
                    </Select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>
                      Pad (ms)
                    </span>
                    <TextInput
                      type="number"
                      min={0}
                      max={2000}
                      step={50}
                      value={String(sd.padMs)}
                      className="h-7 w-20 py-0 text-xs"
                      onChange={(e) => {
                        const n = Math.max(0, Math.min(2000, Number(e.target.value) || 0));
                        updateAudio({ silenceDetection: { ...sd, padMs: n } });
                      }}
                    />
                  </label>
                </>
              )}
            </div>
            {sd.enabled &&
              (activeSilenced ? (
                <div className="space-y-1.5">
                  <BlobWaveform blob={activeSilenced.blob} />
                  <button
                    type="button"
                    className="btn btn-ghost py-0.5 text-[11px]"
                    onClick={resetSilence}
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    disabled={compilingSilence || !activeId}
                    onClick={() => void compileSilence()}
                  >
                    {compilingSilence ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Applying…
                      </>
                    ) : (
                      'Apply'
                    )}
                  </button>
                  {activeSilenceError && (
                    <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                      {activeSilenceError}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </AudioTrackRow>

        {/* Speed up — toggle + settings + result all in one card */}
        <AudioTrackRow
          label={`Speed Up (${su.speed}×)`}
          savedSec={activeSpedup?.savedSec}
          note={!activeSilenced ? 'Uses full audio (no silence-removed clip)' : undefined}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={su.enabled}
                  onChange={(e) => updateAudio({ speedUp: { ...su, enabled: e.target.checked } })}
                />
                <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text-2)' }}>
                  Speed up
                </span>
              </label>
              <button
                type="button"
                className="btn btn-ghost p-0.5"
                aria-label="About speed up"
                title={
                  'Compresses playback time by removing inter-word gaps. The original recording is never changed.\n\n' +
                  '  • 1.25× — subtle; saves ~20% of playback time.\n' +
                  '  • 1.5× — recommended for most sessions; saves ~33%.\n' +
                  '  • 1.75× — aggressive; saves ~43%.'
                }
                style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
              >
                <Info size={13} />
              </button>
              {su.enabled && (
                <label className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>
                    Speed
                  </span>
                  <Select
                    value={String(su.speed)}
                    className="h-7 py-0 text-xs"
                    onChange={(e) =>
                      updateAudio({
                        speedUp: { ...su, speed: Number(e.target.value) as 1.25 | 1.5 | 1.75 },
                      })
                    }
                  >
                    <option value="1.25">1.25× — subtle</option>
                    <option value="1.5">1.5× — recommended</option>
                    <option value="1.75">1.75× — aggressive</option>
                  </Select>
                </label>
              )}
            </div>
            {su.enabled &&
              (activeSpedup ? (
                <div className="space-y-1.5">
                  <BlobWaveform blob={activeSpedup.blob} />
                  <button
                    type="button"
                    className="btn btn-ghost py-0.5 text-[11px]"
                    onClick={resetSpeed}
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    disabled={compilingSpeed}
                    onClick={() => void compileSpeed()}
                  >
                    {compilingSpeed ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Applying…
                      </>
                    ) : (
                      'Apply'
                    )}
                  </button>
                  {activeSpeedError && (
                    <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                      {activeSpeedError}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </AudioTrackRow>
      </div>
    </div>
  );
}

function LiveTranscriptPreview({ live }: { live: UseLiveTranscript }) {
  if (!(live.listening || live.interimText || live.finalText)) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{
        borderColor: 'var(--color-border-soft)',
        background: 'var(--color-surface-2)',
        color: 'var(--color-fg-muted)',
      }}
    >
      <span className="font-medium">Live: </span>
      <span style={{ color: 'var(--color-fg)' }}>{live.finalText}</span>
      {live.interimText && (
        <span className="italic" style={{ color: 'var(--color-fg-subtle)' }}>
          {' '}
          {live.interimText}
        </span>
      )}
    </div>
  );
}
