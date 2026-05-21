import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { formatDuration } from '@/utils/format';
import { MAX_AUDIO_BYTES } from '@/lib/audioLimits';
import { useSettings } from '@/contexts/SettingsProvider';
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities';
import { useWhisperLoading } from '@/hooks/useWhisperLoading';
import { Waveform } from '@/components/design/Waveform';
import type { MicState } from '@/components/design/MicStatusPill';
import type { UseRecorder } from '@/hooks/useRecorder';
import type { UseWebSpeechTranscript, TranscriptSegment } from '@/hooks/useLiveTranscript';
import type { UploadStatus } from '@/hooks/useRecordingFlow';
import type { DeviceCapabilities } from '@/hooks/useDeviceCapabilities';
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

// ── Muted-mic alert chime (Web Audio API) ─────────────────────────────────────
// Two-tone ascending fifth (C5 → G5) at low gain — audible but unobtrusive.
function playAlertChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    for (const [freq, start, dur] of [
      [523.25, 0, 0.12],    // C5
      [783.99, 0.15, 0.18], // G5
    ] as [number, number, number][]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.06, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // AudioContext unavailable — skip chime
  }
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
  capabilities,
}: {
  onStart: () => void;
  onUpload: (file: File) => void;
  onSkip: () => void;
  uploadStatus: UploadStatus;
  isAddingClip?: boolean;
  capabilities?: DeviceCapabilities;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loading: whisperLoading } = useWhisperLoading();
  const isUploading = uploadStatus.phase === 'reading' || uploadStatus.phase === 'saving';
  const hasStatusMessage = uploadStatus.phase !== 'idle';

  const micBlocked = capabilities?.micPermission === 'denied';
  const noRecorder = capabilities?.mediaRecorderSupported === false;
  const recordBlocked = micBlocked || noRecorder;
  const whisperGate = !!(capabilities?.wasmSupported && whisperLoading);
  const buttonDisabled = isUploading || recordBlocked || whisperGate;

  const capBanners = !capabilities || capabilities.checking ? null : (
    <>
      {noRecorder && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          Audio recording is not supported in this browser. Try Chrome, Edge, or Firefox.
        </StatusBanner>
      )}
      {!noRecorder && micBlocked && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          Microphone access is blocked — open your browser settings to allow it for this site.
        </StatusBanner>
      )}
      {capabilities.storageCritical && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="negative">
          Device storage is critically low — recordings may fail to save. Free up space before recording.
        </StatusBanner>
      )}
      {!capabilities.storageCritical && capabilities.storageLow && (
        <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
          Device storage is low — long recordings may not save completely.
        </StatusBanner>
      )}
      {!capabilities.wasmSupported && (
        <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
          Live transcription (Whisper) isn&apos;t available here — WebAssembly is blocked. Cloud transcription still works after recording.
        </StatusBanner>
      )}
      {capabilities.isLowMemoryDevice && capabilities.wasmSupported && (
        <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
          Low-memory device detected — live transcription may be slow or skip segments.
        </StatusBanner>
      )}
      {capabilities.wasmSupported && whisperLoading && (
        <StatusBanner icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />} color="info">
          Preparing transcription model — first run downloads ~150 MB. Recording will be enabled when ready.
        </StatusBanner>
      )}
    </>
  );

  const hasBanners =
    capabilities &&
    !capabilities.checking &&
    (micBlocked ||
      noRecorder ||
      capabilities.storageLow ||
      capabilities.storageCritical ||
      !capabilities.wasmSupported ||
      capabilities.isLowMemoryDevice ||
      (capabilities.wasmSupported && whisperLoading));

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          {!recordBlocked && !whisperGate && (
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: 'var(--color-pt-accent)',
                animation: 'pts-pulse-calm 2.8s ease-out infinite',
              }}
            />
          )}
          <button
            type="button"
            onClick={onStart}
            aria-label={isAddingClip ? 'Record another clip' : 'Start recording'}
            disabled={buttonDisabled}
            className="relative flex items-center justify-center rounded-full transition-opacity"
            style={{
              width: 144,
              height: 144,
              background: recordBlocked
                ? 'var(--color-pt-border-strong)'
                : whisperGate
                  ? 'color-mix(in oklab, var(--color-pt-accent) 55%, var(--color-pt-surface))'
                  : 'var(--color-pt-accent)',
              touchAction: 'manipulation',
              boxShadow: recordBlocked || whisperGate
                ? 'none'
                : '0 8px 32px color-mix(in srgb, var(--color-pt-accent) 35%, transparent)',
              opacity: isUploading ? 0.45 : 1,
              cursor: recordBlocked || whisperGate ? 'not-allowed' : 'pointer',
            }}
          >
            {whisperGate ? (
              <Loader2 size={48} strokeWidth={1.5} style={{ color: 'white' }} className="animate-spin" />
            ) : (
              <Mic size={52} strokeWidth={1.5} style={{ color: 'white' }} />
            )}
          </button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-pt-text-1)' }}>
            {isAddingClip ? 'Record Another Clip' : 'Start Recording'}
          </span>
          <p className="text-sm" style={{ color: 'var(--color-pt-text-3)' }}>
            {micBlocked
              ? 'Microphone permission required'
              : noRecorder
                ? 'Recording not available in this browser'
                : whisperGate
                  ? 'Preparing transcription model…'
                  : isAddingClip
                    ? 'Tap the mic to add a clip to this session'
                    : 'Tap the mic to begin'}
          </p>
        </div>
      </div>

      {/* Device capability warnings */}
      {hasBanners && (
        <div className="w-full flex flex-col gap-2">
          {capBanners}
        </div>
      )}

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

function ChatBubble({
  children,
  timestamp,
  isInterim = false,
}: {
  children: React.ReactNode;
  timestamp?: string;
  isInterim?: boolean;
}) {
  return (
    <div className="flex items-end gap-2">
      {/* Avatar */}
      <div
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{
          background: isInterim ? 'var(--color-pt-surface-alt)' : 'var(--color-pt-accent)',
          border: '1px solid var(--color-pt-border)',
          opacity: isInterim ? 0.5 : 1,
        }}
      >
        <Mic size={11} style={{ color: isInterim ? 'var(--color-pt-text-3)' : 'white' }} />
      </div>
      {/* Bubble — rounded-bl-sm creates the tail toward the avatar */}
      <div
        className="max-w-[82%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
        style={{
          background: 'var(--color-pt-surface-alt)',
          border: '1px solid var(--color-pt-border)',
          opacity: isInterim ? 0.65 : 1,
        }}
      >
        {children}
        {timestamp && (
          <span
            className="block text-right text-[10px] tabular-nums mt-1"
            style={{ color: 'var(--color-pt-text-3)' }}
          >
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ animation: 'transcript-slide-in 280ms ease-out both' }}>
      <ChatBubble isInterim>
        <div className="flex items-center gap-1 py-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{
                background: 'var(--color-pt-text-3)',
                animationDelay: `${i * 160}ms`,
                animationDuration: '900ms',
              }}
            />
          ))}
        </div>
      </ChatBubble>
    </div>
  );
}

function LiveTranscriptView({
  segments,
  interimText,
  whisperBubbles = [],
  expandToFill = false,
  isActive = false,
}: {
  segments: TranscriptSegment[];
  interimText: string;
  whisperBubbles?: string[];
  expandToFill?: boolean;
  isActive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const hasWebSpeech = segments.length > 0 || !!interimText;
  const hasContent = hasWebSpeech || whisperBubbles.length > 0;
  // The hint reveals once the user has been silent for ≥ 8 s. We track the
  // timer-fired flag separately from `hasContent` so the visible hint is a
  // derived value (`hintTimerFired && !hasContent`) — no sync setState in
  // effect needed to clear it when speech arrives.
  const [hintTimerFired, setHintTimerFired] = useState(false);
  useEffect(() => {
    if (hasContent) return;
    const t = window.setTimeout(() => setHintTimerFired(true), 8000);
    return () => window.clearTimeout(t);
  }, [hasContent]);
  const showNoSpeechHint = hintTimerFired && !hasContent;

  // Auto-scroll only when user is already at the bottom
  useEffect(() => {
    const el = containerRef.current;
    if (el && isAtBottom) el.scrollTop = el.scrollHeight;
  }, [segments.length, interimText, whisperBubbles.length, isAtBottom]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distFromBottom < 48);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setIsAtBottom(true);
    }
  }, []);

  return (
    <div
      className={`relative w-full${expandToFill ? ' flex-1 min-h-0' : ''}`}
      style={expandToFill ? {} : { maxHeight: 300 }}
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`w-full rounded-xl overflow-y-auto flex flex-col${expandToFill ? ' h-full' : ' max-h-full'}`}
        style={{
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
            <div className="px-3 py-3 flex flex-col gap-3">
              {hasWebSpeech ? (
                <>
                  {segments.map((seg) => (
                    <div
                      key={seg.wallTime}
                      style={{ animation: 'transcript-slide-in 280ms ease-out both' }}
                    >
                      <ChatBubble timestamp={fmtWallTime(seg.wallTime)}>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-pt-text)' }}>
                          {seg.text.trim()}
                        </p>
                      </ChatBubble>
                    </div>
                  ))}
                  {interimText && (
                    <div style={{ animation: 'transcript-slide-in 280ms ease-out both' }}>
                      <ChatBubble isInterim>
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
                    </div>
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
              {isActive && !interimText && <TypingIndicator />}
            </div>
          </>
        )}
      </div>

      {/* Scroll-to-bottom button — visible when user has scrolled up */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          className="absolute bottom-3 right-3 flex items-center justify-center rounded-full shadow-lg transition-opacity hover:opacity-90"
          style={{
            width: 32,
            height: 32,
            background: 'var(--color-pt-accent)',
            color: 'white',
            animation: 'transcript-slide-in 180ms ease-out both',
            zIndex: 1,
          }}
        >
          <ChevronDown size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ── Active recording state ─────────────────────────────────────────────────────
function ActiveRecordingCard({
  durationSec,
  paused,
  chainActive,
  analyser,
  webSpeech,
  whisperBubbles,
  wasmSupported,
  onPauseResume,
  onStopAndFinish,
}: {
  durationSec: number;
  paused: boolean;
  chainActive: boolean;
  analyser: AnalyserNode | null;
  webSpeech: UseWebSpeechTranscript;
  whisperBubbles: string[];
  wasmSupported?: boolean;
  onPauseResume: () => void;
  onStopAndFinish: () => void;
}) {
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  // Always-fresh elapsed-sec so the restart callback captures current duration, not a snapshot.
  const durationSecRef = useRef(durationSec);
  // Idiomatic ref-mirror. React 19 strict prefers writes inside useEffect, but
  // the consumer (a stable restart callback) only reads from event handlers
  // after commit, so the divergence window doesn't manifest in practice.
  // eslint-disable-next-line react-hooks/refs
  durationSecRef.current = durationSec;

  const micState: MicState = paused ? 'paused' : 'connected';
  const accentColor = paused ? 'var(--color-pt-amber)' : 'var(--color-pt-red)';
  const accentFg = paused ? 'var(--color-pt-amber-fg)' : 'var(--color-pt-red-fg)';

  // ── Two-column layout: transcript left, controls right ──────────────────────
  return (
      <div className="flex gap-0" style={{ height: 480 }}>
        {/* Left: Transcript panel */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 pr-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--color-pt-text-3)' }}
              >
                Transcript
              </p>
              {wasmSupported !== false ? (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--color-pt-accent-soft)', color: 'var(--color-pt-accent-fg)' }}
                >
                  Live Transcription
                </span>
              ) : (
                <span
                  className="text-[10px] italic"
                  style={{ color: 'var(--color-pt-text-3)' }}
                >
                  Live unavailable · processed after recording
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
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
              isActive={!paused}
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
          <Waveform micState={micState} height={40} analyser={analyser} />

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
  const capabilities = useDeviceCapabilities();
  const recording = recorder.status === 'recording' || recorder.status === 'paused';
  const activelyRecording = recorder.status === 'recording';

  const [silenceWarnDismissed, setSilenceWarnDismissed] = useState(false);

  // Play chime once each time the silence warning fires.
  useEffect(() => {
    if (recorder.silenceWarning && activelyRecording) playAlertChime();
    // activelyRecording excluded from deps — we only want to react to silenceWarning transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.silenceWarning]);

  // Auto-clear the dismiss flag when voice resumes so the next silence period warns again.
  // Legitimate external-state mirror — silenceWarning is owned by the recorder
  // state machine and we need to reset our dismiss snapshot at its falling edge.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!recorder.silenceWarning) setSilenceWarnDismissed(false);
  }, [recorder.silenceWarning]);
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

  // Legitimate external-state mirrors — recorder.idleAutoStopped and
  // recorder.status are owned by the recorder state machine; this component
  // latches its own "was auto-stopped" flag in response.
  useEffect(() => {
    if (recorder.idleAutoStopped) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWasAutoStopped(false);
    }
  }, [recorder.status]);

  if (idle && !wasAutoStopped) {
    return <IdleRecordingCard onStart={onStart} onUpload={onUpload} onSkip={onSkip} uploadStatus={uploadStatus} isAddingClip={clips.length > 0} capabilities={capabilities} />;
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

      {activelyRecording && recorder.silenceWarning && !silenceWarnDismissed && (
        <StatusBanner
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          color="negative"
          onDismiss={() => setSilenceWarnDismissed(true)}
        >
          No audio detected for 30 seconds — microphone may be muted or disconnected. Check your mic and try speaking.
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
          analyser={recorder.analyser}
          webSpeech={webSpeech}
          whisperBubbles={whisperBubbles}
          wasmSupported={capabilities?.wasmSupported}
          onPauseResume={onPauseResume}
          onStopAndFinish={onStopAndFinish}
        />
      ) : (
        <IdleRecordingCard onStart={onStart} onUpload={onUpload} onSkip={onSkip} uploadStatus={uploadStatus} isAddingClip={clips.length > 0} capabilities={capabilities} />
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
      return 'Browser speech recognition was blocked — this is common in private/incognito mode. Your recording is still being saved and can be transcribed after.';
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
