import { useState, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  X,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { formatDuration } from '@/utils/format';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import { useSettings } from '@/contexts/SettingsProvider';
import { Waveform } from '@/components/design/Waveform';
import type { MicState } from '@/components/design/MicStatusPill';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseWebSpeechTranscript, TranscriptSegment } from '@/hooks/useLiveTranscript';
import type { UploadStatus } from '@/hooks/useRecordingFlow';
import type { SessionClip } from '@/types';

export interface RecordingPanelProps {
  recorder: UseRecorder;
  webSpeech: UseWebSpeechTranscript;
  clips: SessionClip[];
  whisperBubbles: string[];
  uploadStatus: UploadStatus;
  onStart: () => void;
  onStopAndFinish: () => void;
  onPauseResume: () => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
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

// ── Idle entry point — large centered mic button ─────────────────────────────
function IdleRecordingCard({
  onStart,
  onUpload,
  onSkip,
  uploadStatus,
  isAddingClip = false,
}: {
  onStart: () => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
  uploadStatus: UploadStatus;
  isAddingClip?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadStatus.phase === 'reading' || uploadStatus.phase === 'saving';
  const hasStatusMessage = uploadStatus.phase !== 'idle';

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <span
            className="absolute inset-0 animate-ping rounded-full"
            style={{ background: 'var(--color-pt-accent)', opacity: 0.15 }}
          />
          <button
            type="button"
            onClick={onStart}
            aria-label={isAddingClip ? 'Record another clip' : 'Start recording'}
            disabled={isUploading}
            className="relative flex items-center justify-center rounded-full transition-opacity"
            style={{
              width: 144,
              height: 144,
              background: 'var(--color-pt-accent)',
              touchAction: 'manipulation',
              boxShadow: '0 8px 32px color-mix(in srgb, var(--color-pt-accent) 35%, transparent)',
              opacity: isUploading ? 0.45 : 1,
            }}
          >
            <Mic size={52} strokeWidth={1.5} style={{ color: 'white' }} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-pt-text-1)' }}>
            {isAddingClip ? 'Record Another Clip' : 'Start Recording'}
          </span>
          <p className="text-sm" style={{ color: 'var(--color-pt-text-3)' }}>
            {isAddingClip ? 'Tap the mic to add a clip to this session' : 'Tap the mic to begin'}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-1" style={{ color: 'var(--color-pt-text-3)' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { onUpload(file); e.target.value = ''; }
            }}
          />
          <button
            type="button"
            disabled={isUploading}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-opacity"
            style={{
              touchAction: 'manipulation',
              opacity: isUploading ? 0.6 : 1,
              cursor: isUploading ? 'default' : 'pointer',
            }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {isUploading
              ? <Loader2 size={11} strokeWidth={2} className="animate-spin" />
              : <Upload size={11} strokeWidth={2} />
            }
            {' '}Upload audio
          </button>
          {!isAddingClip && (
            <>
              <span className="text-xs select-none">·</span>
              <button
                type="button"
                disabled={isUploading}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-opacity"
                onClick={onSkip}
                style={{
                  touchAction: 'manipulation',
                  opacity: isUploading ? 0.45 : 1,
                  cursor: isUploading ? 'default' : 'pointer',
                }}
              >
                Skip <ArrowRight size={11} strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {/* Inline upload status — replaces toast */}
        <div style={{ minHeight: 18 }}>
          {hasStatusMessage && (
            <p
              key={uploadStatus.message}
              className="text-xs text-center"
              style={{
                color: uploadStatus.phase === 'error'
                  ? 'var(--color-pt-red-fg)'
                  : uploadStatus.phase === 'done'
                    ? 'var(--color-pt-accent-fg)'
                    : 'var(--color-pt-text-3)',
                animation: 'transcript-slide-in 200ms ease-out both',
              }}
            >
              {uploadStatus.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Live transcript helpers ───────────────────────────────────────────────────

function fmtWallTime(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const min = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2, '0')}${ampm}`;
}

function ChatBubble({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className="self-start max-w-[88%] rounded-2xl rounded-tl-sm px-3.5 py-2"
      style={{
        background: 'var(--color-pt-surface-alt)',
        border: '1px solid var(--color-pt-border)',
        opacity: muted ? 0.6 : 1,
      }}
    >
      {children}
    </div>
  );
}

function LiveTranscriptView({
  segments,
  interimText,
  whisperBubbles = [],
  expandToFill = false,
}: {
  segments: TranscriptSegment[];
  interimText: string;
  whisperBubbles?: string[];
  expandToFill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasWebSpeech = segments.length > 0 || !!interimText;
  const hasContent = hasWebSpeech || whisperBubbles.length > 0;
  const [showNoSpeechHint, setShowNoSpeechHint] = useState(false);

  useEffect(() => {
    if (hasContent) {
      setShowNoSpeechHint(false);
      return;
    }
    const t = window.setTimeout(() => setShowNoSpeechHint(true), 8000);
    return () => window.clearTimeout(t);
  }, [hasContent]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments.length, interimText, whisperBubbles.length]);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl overflow-y-auto flex flex-col${expandToFill ? ' flex-1 min-h-0' : ''}`}
      style={{
        ...(expandToFill ? {} : { maxHeight: 300 }),
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-border)',
      }}
    >
      {!hasContent ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--color-pt-text-3)', animationDelay: `${i * 160}ms` }}
                />
              ))}
            </div>
            <p className="text-xs italic" style={{ color: 'var(--color-pt-text-3)' }}>
              Transcribing&hellip;
            </p>
          </div>
          {showNoSpeechHint && (
            <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--color-pt-text-3)' }}>
              Transcription starts after the first audio chunk (~5 s). First run downloads the model (~150 MB).
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Spacer pushes bubbles to the bottom when content is short */}
          <div className="flex-1 min-h-3" />
          <div className="px-3 py-3 flex flex-col gap-2">
            {hasWebSpeech ? (
              <>
                {segments.map((seg) => (
                  <div
                    key={seg.wallTime}
                    className="flex flex-col items-start gap-0.5"
                    style={{ animation: 'transcript-slide-in 280ms ease-out both' }}
                  >
                    <ChatBubble>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-pt-text)' }}>
                        {seg.text.trim()}
                      </p>
                    </ChatBubble>
                    <span
                      className="ml-1 text-[10px] tabular-nums"
                      style={{ color: 'var(--color-pt-text-3)' }}
                    >
                      {fmtWallTime(seg.wallTime)}
                    </span>
                  </div>
                ))}
                {interimText && (
                  <ChatBubble muted>
                    <p className="text-sm leading-relaxed italic" style={{ color: 'var(--color-pt-text-3)' }}>
                      {interimText}
                      <span
                        className="inline-block ml-0.5 w-px align-middle"
                        style={{
                          height: '1em',
                          background: 'var(--color-pt-accent)',
                          animation: 'transcript-cursor-blink 900ms step-end infinite',
                        }}
                      />
                    </p>
                  </ChatBubble>
                )}
              </>
            ) : (
              whisperBubbles.map((text, i) => {
                const isLast = i === whisperBubbles.length - 1;
                return (
                  <div
                    key={i}
                    style={{ animation: 'transcript-slide-in 280ms ease-out both' }}
                  >
                    <ChatBubble>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-pt-text)' }}>
                        {text}
                        {isLast && (
                          <span
                            className="inline-block ml-0.5 w-px align-middle"
                            style={{
                              height: '1em',
                              background: 'var(--color-pt-accent)',
                              animation: 'transcript-cursor-blink 900ms step-end infinite',
                            }}
                          />
                        )}
                      </p>
                    </ChatBubble>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Active recording state ─────────────────────────────────────────────────────
function ActiveRecordingCard({
  durationSec,
  paused,
  chainActive,
  webSpeech,
  whisperBubbles,
  onPauseResume,
  onStopAndFinish,
}: {
  durationSec: number;
  paused: boolean;
  chainActive: boolean;
  webSpeech: UseWebSpeechTranscript;
  whisperBubbles: string[];
  onPauseResume: () => void;
  onStopAndFinish: () => void;
}) {
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  // Always-fresh elapsed-sec so the restart callback captures current duration, not a snapshot.
  const durationSecRef = useRef(durationSec);
  durationSecRef.current = durationSec;

  const micState: MicState = paused ? 'paused' : 'connected';
  const accentColor = paused ? 'var(--color-pt-amber)' : 'var(--color-pt-red)';
  const accentFg = paused ? 'var(--color-pt-amber-fg)' : 'var(--color-pt-red-fg)';

  // ── Two-column layout: transcript left, controls right ──────────────────────
  // Activate whenever live captions are on OR Whisper has produced any text.
  if (webSpeech.listening || whisperBubbles.length > 0) {
    return (
      <div className="flex gap-0" style={{ minHeight: 480 }}>
        {/* Left: Transcript panel */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 pr-5">
          <div className="flex items-center justify-between">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--color-pt-text-3)' }}
            >
              Transcript · Live
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  webSpeech.stop();
                  window.setTimeout(() => webSpeech.start(() => durationSecRef.current), 150);
                }}
                title="Restart live captions"
                className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-pt-text-3)', minHeight: 44, minWidth: 32, touchAction: 'manipulation' }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={transcriptVisible}
                onClick={() => setTranscriptVisible((v) => !v)}
                className="flex items-center gap-1.5"
                style={{ touchAction: 'manipulation', minHeight: 44 }}
              >
                <span className="text-[11px]" style={{ color: 'var(--color-pt-text-3)' }}>
                  visible
                </span>
                <span
                  className="relative inline-flex h-5 w-9 rounded-full transition-colors duration-200"
                  style={{
                    background: transcriptVisible
                      ? 'var(--color-pt-accent)'
                      : 'var(--color-pt-border-strong)',
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: transcriptVisible ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </span>
              </button>
            </div>
          </div>

          {transcriptVisible ? (
            <LiveTranscriptView
              segments={webSpeech.segments}
              interimText={webSpeech.interimText}
              whisperBubbles={whisperBubbles}
              expandToFill
            />
          ) : (
            <div
              className="flex-1 rounded-xl flex items-center justify-center"
              style={{
                border: '1px dashed var(--color-pt-border)',
                background: 'var(--color-pt-surface)',
              }}
            >
              <p className="text-xs italic" style={{ color: 'var(--color-pt-text-3)' }}>
                Transcript hidden
              </p>
            </div>
          )}
        </div>

        {/* Vertical divider */}
        <div className="w-px self-stretch shrink-0" style={{ background: 'var(--color-pt-border)' }} />

        {/* Right: Controls panel */}
        <div className="flex flex-col gap-3 shrink-0 pl-5" style={{ width: 224 }}>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--color-pt-text-3)' }}
          >
            Controls
          </p>

          {/* Timer */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {!paused && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-65"
                  style={{ background: accentColor }}
                />
              )}
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: accentColor }}
              />
            </span>
            <span
              className="font-mono font-semibold tabular-nums"
              style={{
                color: 'var(--color-pt-text)',
                fontSize: 40,
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {formatDuration(durationSec)}
            </span>
            <span
              className="self-end pb-0.5 text-[11px] font-bold uppercase tracking-widest"
              style={{ color: accentFg }}
            >
              {paused ? 'Paused' : 'Rec'}
            </span>
          </div>

          {/* Waveform */}
          <Waveform micState={micState} height={40} />

          {/* Pause / Resume */}
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={onPauseResume}
            disabled={chainActive}
            style={{ minHeight: 44, touchAction: 'manipulation' }}
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

          {/* Finish recording */}
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={onStopAndFinish}
            disabled={chainActive}
            style={{ minHeight: 44, touchAction: 'manipulation' }}
          >
            <Square size={14} strokeWidth={2} /> Finish Recording
          </button>
        </div>
      </div>
    );
  }

  // ── Single-column layout (live transcript off) ──────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Status label */}
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: 'var(--color-pt-text-3)' }}
      >
        In-Visit · {paused ? 'Paused' : 'Recording'}
      </p>

      {/* Timer */}
      <div className="flex items-center gap-3">
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
          className="font-mono font-semibold tabular-nums"
          style={{
            color: 'var(--color-pt-text)',
            fontSize: 56,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {formatDuration(durationSec)}
        </span>
        <span
          className="self-end pb-1 text-[11px] font-bold uppercase tracking-widest"
          style={{ color: accentFg }}
        >
          {paused ? 'Paused' : 'Recording'}
        </span>
      </div>

      {/* Waveform */}
      <div className="w-full">
        <Waveform micState={micState} height={56} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStopAndFinish}
          disabled={chainActive}
          style={{ minHeight: 44, touchAction: 'manipulation' }}
        >
          <Square size={15} strokeWidth={2} /> Finish Recording
        </button>
      </div>

      {/* Live transcript toggle */}
      <div
        className="w-full rounded-xl px-4 py-3 flex items-center justify-between gap-4"
        style={{
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
        }}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-pt-text)' }}>
            Live transcript
          </p>
          <p className="text-xs" style={{ color: webSpeech.error ? 'var(--color-caution)' : !webSpeech.supported ? 'var(--color-pt-text-3)' : 'var(--color-pt-text-3)' }}>
            {!webSpeech.supported
              ? 'Not available in this browser (Chrome/Edge required)'
              : webSpeech.error
                ? `Captions paused: ${webSpeech.error}`
                : 'Toggle to follow along in real-time'}
          </p>
        </div>
        {webSpeech.supported && (
          <button
            type="button"
            role="switch"
            aria-checked={webSpeech.listening}
            onClick={() => (webSpeech.listening ? webSpeech.stop() : webSpeech.start())}
            className="flex items-center gap-2"
            style={{ touchAction: 'manipulation', flexShrink: 0, minHeight: 44 }}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-wide"
              style={{ color: 'var(--color-pt-text-3)' }}
            >
              OFF
            </span>
            <span
              className="relative inline-flex h-6 w-11 rounded-full"
              style={{ background: 'var(--color-pt-border-strong)' }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
                style={{ transform: 'translateX(0)' }}
              />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function RecordingPanel({
  recorder,
  webSpeech,
  clips,
  whisperBubbles,
  uploadStatus,
  onStart,
  onStopAndFinish,
  onPauseResume,
  onUpload,
  onSkip,
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

  // recorderInterrupted is covered by the wasBackgrounded StatusBanner above.

  useEffect(() => {
    if (recorder.micDisconnected) {
      toast.warning('Microphone disconnected — recording stopped and audio saved.');
    }
  }, [recorder.micDisconnected]);

  useEffect(() => {
    if (recorder.status === 'recording') {
      setWasAutoStopped(false);
    }
  }, [recorder.status]);

  if (idle && !wasAutoStopped) {
    return <IdleRecordingCard onStart={onStart} onUpload={onUpload} onSkip={onSkip} uploadStatus={uploadStatus} isAddingClip={clips.length > 0} />;
  }

  return (
    <div className="space-y-3">
      {wasBackgrounded && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="caution"
          onDismiss={onDismissBackgroundWarning}
        >
          Tab was in the background — recording continued. Verify the clip duration after stopping.
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
          webSpeech={webSpeech}
          whisperBubbles={whisperBubbles}
          onPauseResume={onPauseResume}
          onStopAndFinish={onStopAndFinish}
        />
      ) : (
        <IdleRecordingCard onStart={onStart} onUpload={onUpload} onSkip={onSkip} uploadStatus={uploadStatus} isAddingClip={clips.length > 0} />
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
        liveSupported={webSpeech.supported}
        liveError={webSpeech.error}
        hasFailedClip={clips.some((c) => c.status === 'failed')}
      />

      {!recording && <LiveTranscriptPreview webSpeech={webSpeech} />}
    </div>
  );
}

// ── Estimated file size hint ───────────────────────────────────────────────────
const ESTIMATED_BYTES_PER_SEC = 8 * 1024;
const WARN_THRESHOLD_BYTES = 20 * 1024 * 1024;

function RecordingSizeHint({ durationSec }: { durationSec: number }) {
  const estimatedBytes = durationSec * ESTIMATED_BYTES_PER_SEC;
  const estimatedMb = estimatedBytes / (1024 * 1024);
  const approachingCap = estimatedBytes >= WARN_THRESHOLD_BYTES;
  const overCap = estimatedBytes >= MAX_AUDIO_BYTES;

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
  return null;
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
          className="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
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
      {liveSupported && liveError && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          Live captions stopped: {liveErrorHint(liveError)}
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
function LiveTranscriptPreview({ webSpeech }: { webSpeech: UseWebSpeechTranscript }) {
  if (!(webSpeech.listening || webSpeech.interimText || webSpeech.accumulatedText)) return null;
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
      <span style={{ color: 'var(--color-pt-text)' }}>{webSpeech.accumulatedText}</span>
      {webSpeech.interimText && (
        <span className="italic" style={{ color: 'var(--color-pt-text-3)' }}>
          {' '}
          {webSpeech.interimText}
        </span>
      )}
    </div>
  );
}
