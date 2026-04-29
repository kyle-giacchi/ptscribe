import { useState, useEffect, type ReactNode } from 'react';
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
} from 'lucide-react';
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
    <div className="flex flex-wrap justify-center gap-2 py-2">
      <button type="button" className="btn btn-primary" onClick={onStart}>
        <Mic size={14} strokeWidth={2} /> Record
      </button>
      <label className="btn btn-secondary cursor-pointer">
        <Upload size={14} strokeWidth={2} /> Upload Audio
        <input
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { onUpload(file); e.target.value = ''; }
          }}
        />
      </label>
      <button type="button" className="btn btn-ghost" onClick={onSkip}>
        Skip <ArrowRight size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function RecordingPanel({
  recorder,
  live,
  clips,
  onStart,
  onStop,
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
            className="shrink-0 underline"
            style={{ color: 'var(--color-caution)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <RecordingControlRow
        idle={idle}
        recording={recording}
        paused={recorder.status === 'paused'}
        hasClips={clips.length > 0}
        onStart={onStart}
        onPauseResume={onPauseResume}
        onStop={onStop}
        onUpload={onUpload}
      />

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
              <><Loader2 size={14} className="animate-spin" /> Combining clips…</>
            ) : (
              <><CheckCircle2 size={14} strokeWidth={2} /> Recording Complete</>
            )}
          </button>
        </div>
      )}

      {!recording && <AudioPreviewSection clips={clips} mergedAudioBlob={mergedAudioBlob} />}

      <LiveTranscriptPreview live={live} />
    </div>
  );
}

function SilenceParams() {
  const { settings, updateAudio } = useSettings();
  const sd = settings.audio.silenceDetection;
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--color-pt-border)', background: 'var(--color-pt-surface)' }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={sd.enabled}
            onChange={(e) => updateAudio({ silenceDetection: { ...sd, enabled: e.target.checked } })}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--color-pt-text-2)' }}>
            Silence trimming
          </span>
        </label>

        <span
          title={
            'Silence trimming removes quiet gaps from your audio before it is sent for transcription. ' +
            'The original recording is never changed — only the copy uploaded to Whisper is affected.\n\n' +
            'Sensitivity controls how aggressively silence is detected:\n' +
            '  • Aggressive — drops more audio; best when there are long dead-air gaps between speakers.\n' +
            '  • Balanced — recommended for most PT sessions; skips obvious pauses while keeping natural speech rhythm.\n' +
            '  • Relaxed — only drops very long, obvious silences; safest if you are unsure.\n\n' +
            'Pad (ms) adds a buffer of audio kept before and after each spoken segment so words at the edges are not clipped. ' +
            'Increase this if the transcript is cutting off the beginnings or ends of sentences (try 400–600 ms).'
          }
          className="cursor-help"
          style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
        >
          <Info size={13} />
        </span>

        {sd.enabled && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>Sensitivity</span>
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
              <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>Pad (ms)</span>
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
    </div>
  );
}

function SpeedParams() {
  const { settings, updateAudio } = useSettings();
  const su = settings.audio.speedUp;
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--color-pt-border)', background: 'var(--color-pt-surface)' }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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

        <span
          title={
            'Speed up compresses playback time by removing inter-word gaps and shortening pauses. ' +
            'The original recording is never changed — only the processed copy is affected.\n\n' +
            'Speed factor controls how much faster the audio plays:\n' +
            '  • 1.25× — subtle; saves ~20% of playback time.\n' +
            '  • 1.5× — recommended for most sessions; saves ~33%.\n' +
            '  • 1.75× — aggressive; saves ~43%; may feel rushed.'
          }
          className="cursor-help"
          style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
        >
          <Info size={13} />
        </span>

        {su.enabled && (
          <label className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>Speed</span>
            <Select
              value={String(su.speed)}
              className="h-7 py-0 text-xs"
              onChange={(e) =>
                updateAudio({ speedUp: { ...su, speed: Number(e.target.value) as 1.25 | 1.5 | 1.75 } })
              }
            >
              <option value="1.25">1.25× — subtle</option>
              <option value="1.5">1.5× — recommended</option>
              <option value="1.75">1.75× — aggressive</option>
            </Select>
          </label>
        )}
      </div>
    </div>
  );
}

function RecordingControlRow({
  idle,
  paused,
  hasClips,
  onStart,
  onPauseResume,
  onStop,
  onUpload,
}: {
  idle: boolean;
  recording: boolean;
  paused: boolean;
  hasClips: boolean;
  onStart: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {idle ? (
        <>
          <button type="button" className="btn btn-primary" onClick={onStart}>
            <Mic size={14} strokeWidth={2} /> {hasClips ? 'Add clip' : 'Start recording'}
          </button>
          <label className="btn btn-ghost cursor-pointer">
            <Upload size={14} strokeWidth={2} /> Upload audio
            <input
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { onUpload(file); e.target.value = ''; }
              }}
            />
          </label>
        </>
      ) : (
        <ActiveRecordingControls paused={paused} onPauseResume={onPauseResume} onStop={onStop} />
      )}
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
}: {
  paused: boolean;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onPauseResume}>
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
      <button type="button" className="btn btn-primary" onClick={onStop}>
        <Square size={14} strokeWidth={2} /> Stop
      </button>
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
          className="text-[11px] font-semibold uppercase tracking-wide"
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

function AudioPreviewSection({ clips, mergedAudioBlob }: { clips: SessionClip[]; mergedAudioBlob: Blob | null }) {
  const { settings } = useSettings();
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

  const ordinalOf = (clipId: string) => clips.findIndex((c) => c.id === clipId) + 1;
  const speedLabel = `Speed Up (${settings.audio.speedUp.speed}×)`;

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
        <AudioTrackRow label="Full Audio">
          {mergedAudioBlob
            ? <BlobWaveform blob={mergedAudioBlob} />
            : activeId
              ? <PlaybackWaveform audioKey={activeId} />
              : null
          }
        </AudioTrackRow>

        <SilenceParams />

        <AudioTrackRow label="Silence Removed" savedSec={activeSilenced?.savedSec}>
          {activeSilenced ? (
            <div className="space-y-1.5">
              <BlobWaveform blob={activeSilenced.blob} />
              <button
                type="button"
                onClick={resetSilence}
                className="cursor-pointer text-[11px] underline"
                style={{ color: 'var(--color-pt-text-3)' }}
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
                    <Loader2 size={12} className="animate-spin" /> Compiling…
                  </>
                ) : (
                  'Compile'
                )}
              </button>
              {activeSilenceError && (
                <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                  {activeSilenceError}
                </p>
              )}
            </div>
          )}
        </AudioTrackRow>

        <SpeedParams />

        <AudioTrackRow
          label={speedLabel}
          savedSec={activeSpedup?.savedSec}
          note={!activeSilenced ? 'Uses full audio (no silence-removed clip)' : undefined}
        >
          {activeSpedup ? (
            <div className="space-y-1.5">
              <BlobWaveform blob={activeSpedup.blob} />
              <button
                type="button"
                onClick={resetSpeed}
                className="cursor-pointer text-[11px] underline"
                style={{ color: 'var(--color-pt-text-3)' }}
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
                    <Loader2 size={12} className="animate-spin" /> Compiling…
                  </>
                ) : (
                  'Compile'
                )}
              </button>
              {activeSpeedError && (
                <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                  {activeSpeedError}
                </p>
              )}
            </div>
          )}
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
