import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, Upload, AlertTriangle, Info, PenLine, ChevronRight, Loader2 } from 'lucide-react';
import { useWhisperLoading } from '@/hooks/useWhisperLoading';
import type { UploadStatus } from '@/hooks/sessionMachine/types';
import type { DeviceCapabilities } from '@/hooks/useDeviceCapabilities';
import { StatusBanner } from './StatusBanner';

// ── Secondary-route tile (Upload / Skip) for the fresh-start tray ─────────────
function RouteTile({
  icon,
  title,
  subtitle,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 text-left transition-colors"
      style={{
        width: 280,
        maxWidth: '100%',
        padding: '12px 16px',
        borderRadius: 10,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        color: 'var(--color-pt-text)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'manipulation',
      }}
    >
      <span style={{ flexShrink: 0, color: 'var(--color-pt-text-2)' }}>{icon}</span>
      <span className="flex min-w-0 flex-col" style={{ flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text-1)' }}>
          {title}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{subtitle}</span>
      </span>
      <ChevronRight
        size={16}
        strokeWidth={2}
        style={{ flexShrink: 0, color: 'var(--color-pt-text-3)' }}
      />
    </button>
  );
}

// ── Idle entry point — Variant B hero mic + secondary tray ────────────────────
export function IdleRecordingCard({
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

  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const isUploading = uploadStatus.phase === 'reading' || uploadStatus.phase === 'saving';
  const hasStatusMessage = uploadStatus.phase !== 'idle';

  const micBlocked = capabilities?.micPermission === 'denied';
  const noRecorder = capabilities?.mediaRecorderSupported === false;
  const recordBlocked = micBlocked || noRecorder;
  const whisperGate = !!(capabilities?.wasmSupported && whisperLoading);
  const buttonDisabled = isUploading || recordBlocked || whisperGate;

  // Helper text shown beneath the mic — mirrors the blocked/preparing states.
  const micHelper = micBlocked
    ? 'Microphone permission required'
    : noRecorder
      ? 'Recording not available in this browser'
      : whisperGate
        ? 'Preparing transcription model…'
        : null;

  const capBanners =
    !capabilities || capabilities.checking ? null : (
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
            Device storage is critically low — recordings may fail to save. Free up space before
            recording.
          </StatusBanner>
        )}
        {!capabilities.storageCritical && capabilities.storageLow && (
          <StatusBanner icon={<AlertTriangle className="h-3.5 w-3.5" />} color="caution">
            Device storage is low — long recordings may not save completely.
          </StatusBanner>
        )}
        {!capabilities.wasmSupported && (
          <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
            Live transcription (Whisper) isn&apos;t available here — WebAssembly is blocked. Cloud
            transcription still works after recording.
          </StatusBanner>
        )}
        {capabilities.isLowMemoryDevice && capabilities.wasmSupported && (
          <StatusBanner icon={<Info className="h-3.5 w-3.5" />} color="info">
            Low-memory device detected — live transcription may be slow or skip segments.
          </StatusBanner>
        )}
        {capabilities.wasmSupported && whisperLoading && (
          <StatusBanner icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />} color="info">
            Preparing transcription model — first run downloads ~150 MB. Recording will be enabled
            when ready.
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
    <div className="flex flex-col items-center gap-6 py-12">
      {/* Eyebrow + headings */}
      <div className="flex flex-col items-center gap-1.5">
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--color-pt-text-1)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          {isAddingClip ? 'Record another clip' : 'Tap to start recording'}
        </h1>
        {isAddingClip && (
          <p className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
            Add another clip to this session
          </p>
        )}
      </div>

      {/* Hero record button */}
      <div className="flex flex-col items-center gap-3" style={{ marginTop: 2 }}>
        <div className="relative">
          {!recordBlocked && !whisperGate && (
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: 'var(--color-pt-accent)',
                animation: 'pts-pulse-calm 3.2s linear infinite',
                animationPlayState: tabHidden ? 'paused' : 'running',
                willChange: 'transform, opacity',
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
              width: 168,
              height: 168,
              background: recordBlocked
                ? 'var(--color-pt-border-strong)'
                : whisperGate
                  ? 'color-mix(in oklab, var(--color-pt-accent) 55%, var(--color-pt-surface))'
                  : 'var(--color-pt-accent)',
              border:
                recordBlocked || whisperGate
                  ? '8px solid var(--color-pt-border)'
                  : '8px solid var(--color-pt-accent-soft)',
              touchAction: 'manipulation',
              boxShadow:
                recordBlocked || whisperGate
                  ? 'none'
                  : '0 12px 36px color-mix(in srgb, var(--color-pt-accent) 30%, transparent)',
              opacity: isUploading ? 0.45 : 1,
              cursor: recordBlocked || whisperGate ? 'not-allowed' : 'pointer',
            }}
          >
            {whisperGate ? (
              <Loader2
                size={60}
                strokeWidth={1.5}
                style={{ color: 'white' }}
                className="animate-spin"
              />
            ) : (
              <Mic size={64} strokeWidth={1.5} style={{ color: 'white' }} />
            )}
          </button>
        </div>
        {micHelper && (
          <p className="text-xs" style={{ color: 'var(--color-pt-text-3)' }}>
            {micHelper}
          </p>
        )}
      </div>

      {/* Device capability warnings */}
      {hasBanners && (
        <div className="flex w-full flex-col gap-2" style={{ maxWidth: 572 }}>
          {capBanners}
        </div>
      )}

      {/* "or" divider */}
      <div
        className="flex items-center gap-3"
        style={{ width: 360, maxWidth: '100%', marginTop: 12, marginBottom: 12 }}
      >
        <div style={{ flex: 1, height: 1, background: 'var(--color-pt-border)' }} />
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ letterSpacing: '0.08em', color: 'var(--color-pt-text-3)' }}
        >
          or
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-pt-border)' }} />
      </div>

      {/* Secondary route tray */}
      <input
        ref={fileInputRef}
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
      <div className="flex flex-wrap items-stretch justify-center gap-3">
        <RouteTile
          icon={
            isUploading ? (
              <Loader2 size={22} strokeWidth={2} className="animate-spin" />
            ) : (
              <Upload size={22} strokeWidth={2} />
            )
          }
          title="Upload audio"
          subtitle=".m4a · .mp3 · .wav up to 2hr"
          disabled={isUploading}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        />
        {!isAddingClip && (
          <RouteTile
            icon={<PenLine size={22} strokeWidth={2} />}
            title="Skip / Edit Manually"
            subtitle="Type the note manually or add audio later!"
            disabled={isUploading}
            onClick={onSkip}
          />
        )}
      </div>

      {/* Inline upload status — replaces toast */}
      <div style={{ minHeight: 18 }}>
        {hasStatusMessage && (
          <p
            key={uploadStatus.message}
            className="text-center text-xs"
            style={{
              color:
                uploadStatus.phase === 'error'
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
  );
}
