import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, Mic, Play, Trash2, Upload, X, CornerDownLeft } from 'lucide-react';
import { audioRepository } from '@/services/AudioRepository';
import { duration, ease } from '@/lib/motion';
import { useBelowBreakpoint } from '@/hooks/useBelowBreakpoint';
import { useDismissable } from '@/hooks/useDismissable';
import { AudioFileInput, type AudioFileInputHandle } from '@/components/common/AudioFileInput';
import type { T2Phase } from '@/hooks/useBackgroundTranscription';
import type { SessionClip } from '@/types';
import { formatDuration } from '@/utils/format';
import { clipStatusTone } from '@/utils/clips';

interface ClipsDrawerProps {
  open: boolean;
  clips: SessionClip[];
  onClose: () => void;
  onJump: (startOffsetSec: number) => void;
  onDelete: (clipId: string) => void;
  onRecord: () => void;
  onUpload: (file: File) => void;
  t2Phase: T2Phase;
  t2Label: string;
}

interface InnerProps {
  clips: SessionClip[];
  total: number;
  newest: SessionClip | null;
  fileRef: React.RefObject<AudioFileInputHandle | null>;
  onClose: () => void;
  onJump: (startOffsetSec: number) => void;
  onDelete: (clipId: string) => void;
  onRecord: () => void;
  onUpload: (file: File) => void;
  isMobile: boolean;
  t2Phase: T2Phase;
  t2Label: string;
}

function Inner({
  clips,
  total,
  newest,
  fileRef,
  onClose,
  onJump,
  onDelete,
  onRecord,
  onUpload,
  isMobile,
  t2Phase,
  t2Label,
}: InnerProps) {
  return (
    <>
      {/* Header */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
        }}
      >
        <AudioLines size={14} strokeWidth={2} style={{ color: 'var(--color-pt-accent)' }} />
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-pt-text)', margin: 0 }}>
          Audio clips
        </h2>
        <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>
          {clips.length} clip{clips.length !== 1 ? 's' : ''} · {formatDuration(total)} · this visit
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close audio clips panel"
          className="btn btn-ghost p-1.5"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {clips.length === 0 ? (
          <div style={{ padding: '32px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text-2)' }}>
              No clips yet
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-pt-text-3)', marginTop: 4 }}>
              Record or upload a clip to start.
            </div>
          </div>
        ) : (
          clips.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              isActive={clip.id === newest?.id}
              onJump={() => {
                onClose();
                onJump(clip.startOffsetSec ?? 0);
              }}
              onDelete={() => onDelete(clip.id)}
              t2Phase={t2Phase}
              t2Label={t2Label}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: 14,
          paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 14px)' : 14,
          borderTop: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          style={{ height: 34, fontSize: 12.5 }}
          onClick={() => {
            onClose();
            onRecord();
          }}
        >
          <Mic size={13} strokeWidth={2} /> New recording
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ height: 32, fontSize: 12 }}
          onClick={() => fileRef.current?.open()}
        >
          <Upload size={13} strokeWidth={2} /> Upload audio file
        </button>
        <AudioFileInput
          ref={fileRef}
          onPick={(f) => {
            onUpload(f);
            onClose();
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--color-pt-text-3)',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Adding a clip re-runs the note generation across all clips.
        </p>
      </div>
    </>
  );
}

export function ClipsDrawer({
  open,
  clips,
  onClose,
  onJump,
  onDelete,
  onRecord,
  onUpload,
  t2Phase,
  t2Label,
}: ClipsDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<AudioFileInputHandle>(null);
  const isMobile = useBelowBreakpoint(768);

  useDismissable({ open, onClose, ref: dialogRef, closeOnOutside: false });

  const total = clips.reduce((sum, c) => sum + (c.durationSec ?? 0), 0);
  const newest =
    clips.length > 0 ? clips.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : null;

  const innerProps: InnerProps = {
    clips,
    total,
    newest,
    fileRef,
    onClose,
    onJump,
    onDelete,
    onRecord,
    onUpload,
    isMobile,
    t2Phase,
    t2Label,
  };

  return (
    <AnimatePresence>
      {open &&
        (isMobile ? (
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-label="Audio clips"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: duration.base, ease: ease.enter }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height: '80vh',
              zIndex: 30,
              background: 'var(--color-pt-surface)',
              borderTop: '1px solid var(--color-pt-border)',
              boxShadow: '0 -18px 36px rgba(43,40,38,0.10)',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <Inner {...innerProps} />
          </motion.div>
        ) : (
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-label="Audio clips"
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ duration: duration.base, ease: ease.enter }}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 380,
              zIndex: 20,
              background: 'var(--color-pt-surface)',
              borderLeft: '1px solid var(--color-pt-border)',
              boxShadow: '-18px 0 36px rgba(43,40,38,0.10)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Inner {...innerProps} />
          </motion.div>
        ))}
    </AnimatePresence>
  );
}

function ClipCard({
  clip,
  index,
  isActive,
  onJump,
  onDelete,
  t2Phase,
  t2Label,
}: {
  clip: SessionClip;
  index: number;
  isActive: boolean;
  onJump: () => void;
  onDelete: () => void;
  t2Phase: T2Phase;
  t2Label: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      const blob = await audioRepository.load(clip.id);
      if (cancelled || !blob) return;
      createdUrl = URL.createObjectURL(blob);
      setUrl(createdUrl);
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setUrl(null);
    };
  }, [playing, clip.id]);

  const bars = useMemo(
    () =>
      Array.from(
        { length: 48 },
        (_, j) => Math.abs(Math.sin(j * 0.7 + index) * Math.cos(j * 0.18)) * 22,
      ),
    [index],
  );

  const time = new Date(clip.createdAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const source = 'in-room mic';
  const { statusTone, statusLabel } = clipStatusTone(clip, t2Phase, t2Label);

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${isActive ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
        borderLeft: isActive
          ? '3px solid var(--color-pt-accent-border)'
          : `1px solid var(--color-pt-border)`,
        background: isActive
          ? 'color-mix(in oklab, var(--color-pt-accent) 12%, transparent)'
          : 'var(--color-pt-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-2">
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-pt-text-3)' }}
        >
          #{index + 1}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)' }}>
          Clip {index + 1}
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-pt-text-3)' }}
        >
          {formatDuration(clip.durationSec ?? 0)}
        </span>
      </div>

      {/* Waveform */}
      <div className="flex items-end gap-[2px]" style={{ height: 24 }} aria-hidden>
        {bars.map((h, j) => (
          <span
            key={j}
            style={{
              width: 2,
              height: Math.max(2, h),
              borderRadius: 1,
              background: 'var(--color-pt-text-3)',
              opacity: 0.55,
            }}
          />
        ))}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{time}</span>
        <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>· {source}</span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 999,
            background:
              statusTone === 'accent'
                ? 'var(--color-pt-accent-soft)'
                : statusTone === 'negative'
                  ? 'color-mix(in oklab, var(--color-negative) 12%, transparent)'
                  : 'color-mix(in oklab, var(--color-caution) 14%, transparent)',
            color:
              statusTone === 'accent'
                ? 'var(--color-pt-accent-fg)'
                : statusTone === 'negative'
                  ? 'var(--color-negative)'
                  : 'var(--color-caution)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        {playing && url ? (
          <audio
            controls
            autoPlay
            src={url}
            style={{ flex: 1, height: 28 }}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              // ponytail: Chrome reports Infinity duration for MediaRecorder webm blobs
              // until seeked once; this forces it to index the real length.
              if (el.duration === Infinity) {
                el.currentTime = 1e101;
                el.ontimeupdate = () => {
                  el.ontimeupdate = null;
                  el.currentTime = 0;
                };
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ height: 28, fontSize: 12 }}
            onClick={() => setPlaying(true)}
          >
            <Play size={12} strokeWidth={2} /> Play
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          style={{ height: 28, fontSize: 12 }}
          onClick={onJump}
        >
          <CornerDownLeft size={12} strokeWidth={2} /> Jump to transcript
        </button>
        <button
          type="button"
          aria-label={`Delete clip ${index + 1}`}
          className="btn btn-ghost"
          style={{
            height: 28,
            padding: '0 8px',
            marginLeft: 'auto',
            color: 'var(--color-pt-danger, #dc2626)',
          }}
          onClick={onDelete}
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
