import { FileText, List, Mic, Pause, Play, Settings, Square } from 'lucide-react';
import { formatDuration } from '@/utils/format';

export interface SessionTabBarProps {
  activeTab: 'record' | 'review' | 'clips';
  setActiveTab: (tab: 'record' | 'review' | 'clips') => void;
  clipsCount: number;
  noteFinalized?: boolean;
  hasNote: boolean;
  onOpenDrawer: () => void;
  recorderStatus: string;
  durationSec: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStopAndFinish: () => void;
  onPauseResume: () => void;
}

function CompactRecordingControl({
  status,
  durationSec,
  onStart,
  onStop: _onStop,
  onStopAndFinish,
  onPauseResume,
}: {
  status: string;
  durationSec: number;
  onStart: () => void;
  onStop: () => void;
  onStopAndFinish: () => void;
  onPauseResume: () => void;
}) {
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const active = isRecording || isPaused;

  if (!active) {
    return (
      <button
        type="button"
        onClick={onStart}
        aria-label="Start recording"
        className="inline-flex items-center gap-1.5 rounded-lg transition-opacity hover:opacity-90 active:scale-95"
        style={{
          padding: '6px 14px',
          height: 34,
          fontSize: 12.5,
          fontWeight: 600,
          color: '#ffffff',
          background: 'var(--color-pt-accent)',
          border: 'none',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        <Mic size={13} strokeWidth={2} />
        Start
      </button>
    );
  }

  const accentColor = isPaused ? 'var(--color-pt-amber)' : 'var(--color-pt-red)';
  const borderColor = isPaused ? 'var(--color-pt-amber-border)' : 'var(--color-pt-red-border)';
  const bg = isPaused
    ? 'color-mix(in oklab, var(--color-pt-amber) 8%, var(--color-pt-surface))'
    : 'color-mix(in oklab, var(--color-pt-red) 6%, var(--color-pt-surface))';

  return (
    <div
      className="flex items-center gap-0.5"
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        background: bg,
        padding: '0 2px 0 10px',
        height: 34,
      }}
    >
      <span className="relative mr-1.5 flex h-2 w-2 shrink-0">
        {isRecording && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-65"
            style={{ background: accentColor }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: accentColor }}
        />
      </span>
      <span
        className="font-mono tabular-nums"
        style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text)', minWidth: 38 }}
      >
        {formatDuration(durationSec)}
      </span>
      <button
        type="button"
        onClick={onPauseResume}
        aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
        className="flex items-center justify-center rounded transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{
          width: 30,
          height: 30,
          color: 'var(--color-pt-text-2)',
          touchAction: 'manipulation',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        {isPaused ? <Play size={12} strokeWidth={2.5} /> : <Pause size={12} strokeWidth={2.5} />}
      </button>
      <button
        type="button"
        onClick={onStopAndFinish}
        aria-label="Stop recording"
        className="flex items-center justify-center rounded transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        style={{
          width: 30,
          height: 30,
          color: 'var(--color-pt-text-2)',
          touchAction: 'manipulation',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <Square size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function SessionTabBar({
  activeTab,
  setActiveTab,
  clipsCount,
  noteFinalized,
  hasNote,
  onOpenDrawer,
  recorderStatus,
  durationSec,
  onStartRecording,
  onStopRecording,
  onStopAndFinish,
  onPauseResume,
}: SessionTabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 22px 0',
      }}
    >
      <div
        role="tablist"
        className="inline-flex items-center gap-0.5 p-1"
        style={{ background: '#eaeef4', borderRadius: 10 }}
      >
        {/* Record tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'record'}
          onClick={() => setActiveTab('record')}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: activeTab === 'record' ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
            background: activeTab === 'record' ? 'var(--color-pt-surface)' : 'transparent',
            boxShadow: activeTab === 'record' ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Mic size={13} strokeWidth={2} />
          Record
        </button>

        {/* Clips tab — visible when clips exist */}
        {clipsCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'clips'}
            onClick={() => setActiveTab('clips')}
            className="inline-flex items-center gap-1.5 transition-colors"
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              color: activeTab === 'clips' ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
              background: activeTab === 'clips' ? 'var(--color-pt-surface)' : 'transparent',
              boxShadow: activeTab === 'clips' ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <List size={13} strokeWidth={2} />
            Clips
            <span
              className="tabular-nums"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 999,
                background: activeTab === 'clips'
                  ? 'color-mix(in oklab, var(--color-pt-accent) 15%, transparent)'
                  : 'rgba(26,32,48,0.08)',
                color: activeTab === 'clips' ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
              }}
            >
              {clipsCount}
            </span>
          </button>
        )}

        {/* Review tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'review'}
          onClick={() => setActiveTab('review')}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: activeTab === 'review' ? 'var(--color-pt-text)' : 'var(--color-pt-text-2)',
            background: activeTab === 'review' ? 'var(--color-pt-surface)' : 'transparent',
            boxShadow: activeTab === 'review' ? '0 1px 2px rgba(26,32,48,0.06)' : 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <FileText size={13} strokeWidth={2} />
          Review
          {hasNote && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 999,
                background: noteFinalized
                  ? 'color-mix(in oklab, var(--color-pt-accent) 15%, transparent)'
                  : 'rgba(26,32,48,0.08)',
                color: noteFinalized ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
              }}
            >
              {noteFinalized ? 'Final' : 'Draft'}
            </span>
          )}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <CompactRecordingControl
        status={recorderStatus}
        durationSec={durationSec}
        onStart={onStartRecording}
        onStop={onStopRecording}
        onStopAndFinish={onStopAndFinish}
        onPauseResume={onPauseResume}
      />

      <button
        type="button"
        onClick={onOpenDrawer}
        title="Debug tools"
        style={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 8,
          cursor: 'pointer',
          color: 'var(--color-pt-text-2)',
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
        }}
      >
        <Settings size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
