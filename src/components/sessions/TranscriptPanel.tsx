import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Wand2,
  Copy,
  EyeOff,
  PanelRightClose,
  Loader2,
} from 'lucide-react';
import type { SessionClip } from '@/types';
import { mergeClipTranscriptsWithMarkers, stripClipMarkers } from '@/utils/clips';
import { parseTranscriptSegments, parseChunkedTranscript } from '@/utils/transcriptGrouping';
import { ConfirmBanner } from './ConfirmBanner';

interface TranscriptPanelProps {
  transcript: string;
  clips: SessionClip[];
  transcribing: boolean;
  hasUserEdits: boolean;
  hasT2Transcript: boolean;
  hasT3Transcript: boolean;
  totalDurationSec: number;
  collapsed: boolean;
  onCollapse: () => void;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCreateTranscript: (clipId?: string) => void;
  canImproveWithAI?: boolean;
  /** When set, the Improve-with-AI button renders disabled with this string as its tooltip (e.g. demo mode, cap spent). */
  cloudDisabledReason?: string;
  onRevertToLocal: () => void;
  onCopyTranscript?: () => void;
  onOpenPIIScrub?: () => void;
  hasEditedTranscript?: boolean;
  onRevertEdits?: () => void;
  /** Fired by parent (e.g. clip jump); creates a new object on each jump so the effect always re-fires. */
  seekSignal?: { seconds: number; id: number } | null;
}

function TranscriptPanelImpl(props: TranscriptPanelProps) {
  const {
    transcript,
    clips,
    transcribing,
    hasUserEdits,
    hasT2Transcript,
    hasT3Transcript,
    totalDurationSec,
    collapsed,
    onCollapse,
    onChange,
    onCommit,
    onCreateTranscript,
    onRevertToLocal,
    onCopyTranscript,
    onOpenPIIScrub,
    hasEditedTranscript,
    onRevertEdits,
    canImproveWithAI = true,
    cloudDisabledReason,
    seekSignal,
  } = props;

  const scrollRootRef = useRef<HTMLDivElement>(null);

  // Reactive scroll-to-timestamp — fires whenever seekSignal changes identity
  useEffect(() => {
    if (!seekSignal) return;
    const { seconds } = seekSignal;
    // Retry across animation frames so the panel can expand before scroll runs
    function attempt(retriesLeft: number) {
      const root = scrollRootRef.current;
      const candidates = root ? Array.from(root.querySelectorAll<HTMLElement>('[data-ts]')) : [];
      if (candidates.length === 0) {
        if (retriesLeft > 0) requestAnimationFrame(() => attempt(retriesLeft - 1));
        return;
      }
      const target =
        candidates.find((el) => Number(el.dataset.ts ?? 0) >= seconds) ??
        candidates[candidates.length - 1];
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    attempt(3);
  }, [seekSignal]);

  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [replaceStr, setReplaceStr] = useState('');
  const [replaceCount, setReplaceCount] = useState<number | null>(null);

  const transcribedClips = clips.filter(
    (c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0,
  );
  const showClipMarkers = transcribedClips.length > 1 && !hasUserEdits;
  const displayTranscript = showClipMarkers ? mergeClipTranscriptsWithMarkers(clips) : transcript;

  const chunkedSegments = clips.some((c) => c.transcriptChunks?.length)
    ? parseChunkedTranscript(clips)
    : null;
  const segments = chunkedSegments ?? parseTranscriptSegments(transcript, totalDurationSec);
  const allMatches = buildMatches(segments, searchQuery);
  const matchCount = allMatches.length;
  const safeIndex = matchCount > 0 ? matchIndex % matchCount : 0;

  const tier: 'modified' | 'cloud' | 'local' | null = hasUserEdits
    ? 'modified'
    : hasT3Transcript
      ? 'cloud'
      : transcript.trim()
        ? 'local'
        : null;

  function handleTranscriptChange(next: string) {
    onChange(showClipMarkers ? stripClipMarkers(next) : next);
  }
  function handleCreateClick() {
    if (hasUserEdits) setPendingOverwrite(true);
    else onCreateTranscript();
  }
  function handleReplaceAll() {
    if (!searchQuery) return;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = (transcript.match(regex) ?? []).length;
    onChange(transcript.replace(regex, replaceStr));
    onCommit();
    setReplaceCount(count);
  }

  if (collapsed) return null;

  // With no transcript yet (e.g. the clinician skipped transcription), drop straight
  // into the textarea so they can type a transcript by hand. Don't force it open while
  // a transcription is in flight — the result is about to land.
  const isEmpty = !transcript.trim();
  const effectiveEditMode = editMode || (isEmpty && !transcribing);

  return (
    <div className="space-y-3">
      {pendingOverwrite && (
        <ConfirmBanner
          message="This will replace your edited transcript."
          confirmLabel="Yes, replace"
          onCancel={() => setPendingOverwrite(false)}
          onConfirm={() => {
            setPendingOverwrite(false);
            onCreateTranscript();
          }}
        />
      )}

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--color-pt-border)' }}
      >
        {/* Header — Row 1 (tier + actions) */}
        <div
          className="flex flex-wrap items-center gap-2"
          style={{ padding: '12px 20px 8px', background: 'var(--color-pt-surface-alt)' }}
        >
          <span
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Transcript
          </span>
          {tier && <TierChip tier={tier} />}
          {transcript.trim() && (
            <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {transcript.trim().split(/\s+/).filter(Boolean).length}w
            </span>
          )}

          <div style={{ flex: 1 }} />

          {hasEditedTranscript && onRevertEdits && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={onRevertEdits}
              title="Clear your edits and show the original transcript."
            >
              <RotateCcw size={13} strokeWidth={2} /> Revert edits
            </button>
          )}
          {hasT2Transcript && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={onRevertToLocal}
              title="Restore the on-device draft transcript captured while you were recording."
            >
              <RotateCcw size={13} strokeWidth={2} /> Revert to draft transcript
            </button>
          )}
          {canImproveWithAI && transcript.trim() && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              disabled={transcribing || Boolean(cloudDisabledReason)}
              onClick={handleCreateClick}
              title={
                cloudDisabledReason ??
                'Re-transcribe using cloud AI (silence trimmed + sped up) for a cleaner result.'
              }
            >
              {transcribing ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Transcribing…
                </>
              ) : (
                <>
                  <Wand2 size={13} strokeWidth={2} /> Improve with AI
                </>
              )}
            </button>
          )}
          {onOpenPIIScrub && transcript.trim() && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={onOpenPIIScrub}
            >
              <EyeOff size={13} strokeWidth={2} /> Scrub PII
            </button>
          )}

          {onCopyTranscript && transcript.trim() && (
            <button
              type="button"
              className="btn btn-ghost p-1.5"
              onClick={onCopyTranscript}
              title="Copy transcript"
              aria-label="Copy transcript"
            >
              <Copy size={13} strokeWidth={2} />
            </button>
          )}
          <div style={{ width: 1, height: 18, background: 'var(--color-pt-border)' }} aria-hidden />
          {transcript.trim() && (
            <button
              type="button"
              className="btn btn-ghost p-1.5"
              title={editMode ? 'Switch to formatted view' : 'Edit transcript'}
              onClick={() => setEditMode((m) => !m)}
              style={{ color: editMode ? 'var(--color-pt-accent)' : 'var(--color-fg-subtle)' }}
            >
              <Edit3 size={13} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost p-1.5"
            onClick={onCollapse}
            aria-label="Collapse transcript panel"
            title="Collapse transcript panel"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            <PanelRightClose size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Header — Row 2 (search, read-only mode only) */}
        {!effectiveEditMode && (
          <div
            style={{
              padding: '0 20px 12px',
              background: 'var(--color-pt-surface-alt)',
              borderBottom: '1px solid var(--color-pt-border)',
            }}
          >
            <div className="relative flex items-center" style={{ maxWidth: 280 }}>
              <Search
                size={12}
                strokeWidth={2}
                style={{
                  position: 'absolute',
                  left: 7,
                  color: 'var(--color-fg-subtle)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                aria-label="Search transcript"
                placeholder="Search transcript…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setMatchIndex(0);
                }}
                className="input h-7 py-0 text-xs"
                style={{ paddingLeft: 24, paddingRight: searchQuery ? 56 : 8, width: '100%' }}
              />
              {searchQuery && (
                <>
                  <span
                    className="absolute text-[10px] tabular-nums"
                    style={{ right: 44, color: 'var(--color-fg-subtle)' }}
                  >
                    {matchCount > 0 ? `${safeIndex + 1}/${matchCount}` : '0'}
                  </span>
                  <button
                    type="button"
                    className="absolute flex items-center justify-center"
                    style={{
                      right: 24,
                      width: 18,
                      height: 18,
                      color: 'var(--color-fg-subtle)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setMatchIndex((i) => (i - 1 + matchCount) % Math.max(matchCount, 1))
                    }
                  >
                    <ChevronLeft size={11} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    className="absolute flex items-center justify-center"
                    style={{
                      right: 6,
                      width: 18,
                      height: 18,
                      color: 'var(--color-fg-subtle)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() => setMatchIndex((i) => (i + 1) % Math.max(matchCount, 1))}
                  >
                    <ChevronRight size={11} strokeWidth={2.5} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div>
          {effectiveEditMode ? (
            <>
              {!isEmpty && (
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                  style={{
                    borderBottom: '1px solid var(--color-pt-border)',
                    background: 'var(--color-pt-surface-alt)',
                  }}
                >
                  <input
                    type="text"
                    aria-label="Find"
                    className="input h-7 py-0 text-sm"
                    style={{ width: '10rem' }}
                    placeholder="Find"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setReplaceCount(null);
                    }}
                  />
                  <input
                    type="text"
                    aria-label="Replace with"
                    className="input h-7 py-0 text-sm"
                    style={{ width: '10rem' }}
                    placeholder="Replace with"
                    value={replaceStr}
                    onChange={(e) => setReplaceStr(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ height: '1.75rem', paddingTop: 0, paddingBottom: 0 }}
                    disabled={!searchQuery}
                    onClick={handleReplaceAll}
                  >
                    Replace All
                  </button>
                  {replaceCount !== null && (
                    <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                      {replaceCount === 0
                        ? 'No matches'
                        : `Replaced ${replaceCount} occurrence${replaceCount !== 1 ? 's' : ''}`}
                    </span>
                  )}
                </div>
              )}
              <textarea
                className="input w-full rounded-none leading-relaxed"
                style={{
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  borderTop: '1px solid var(--color-pt-border)',
                  height: 'max(320px, calc(100vh - 300px))',
                }}
                placeholder="Speak while recording, paste in a transcript, or type freely."
                value={displayTranscript}
                onChange={(e) => handleTranscriptChange(e.target.value)}
                onBlur={onCommit}
              />
            </>
          ) : (
            <FormattedTranscriptView
              rootRef={scrollRootRef}
              segments={segments}
              searchQuery={searchQuery}
              activeMatchIndex={safeIndex}
              transcript={transcript}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TierChip({ tier }: { tier: 'modified' | 'cloud' | 'local' }) {
  const label =
    tier === 'modified' ? 'User Modified' : tier === 'cloud' ? 'AI Enhanced' : 'Locally Processed';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 999,
        background: 'var(--color-pt-accent-soft)',
        color: 'var(--color-pt-accent-fg)',
        border: '1px solid var(--color-pt-accent-border)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
  );
}

// ── Formatted transcript view ─────────────────────────────────────────────────

interface MatchPos {
  segmentIndex: number;
  charStart: number;
  charEnd: number;
  globalIndex: number;
}

function buildMatches(
  segments: ReturnType<typeof parseTranscriptSegments>,
  query: string,
): MatchPos[] {
  if (!query) return [];
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const result: MatchPos[] = [];
  let globalIndex = 0;
  segments.forEach((seg, si) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg.text)) !== null) {
      result.push({
        segmentIndex: si,
        charStart: m.index,
        charEnd: m.index + m[0].length,
        globalIndex,
      });
      globalIndex++;
    }
  });
  return result;
}

function FormattedTranscriptView({
  rootRef,
  segments,
  searchQuery,
  activeMatchIndex,
  transcript,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  segments: ReturnType<typeof parseTranscriptSegments>;
  searchQuery: string;
  activeMatchIndex: number;
  transcript: string;
}) {
  const allMatches = buildMatches(segments, searchQuery);

  const callbackRef = useCallback(
    (el: HTMLElement | null) => {
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMatchIndex, searchQuery],
  );

  if (!transcript.trim()) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
          No transcript yet — record a clip or generate AI transcription.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="space-y-3 overflow-y-auto px-4 py-3"
      style={{ maxHeight: 460, fontSize: 13, lineHeight: '1.7' }}
    >
      {segments.map((seg, si) => (
        <div key={si} data-ts={seg.estimatedSec ?? si * 60}>
          {seg.showMinuteDivider && (
            <div
              className="my-3 flex items-center gap-2"
              aria-label={`Timestamp ${seg.minuteLabel}`}
            >
              <span
                className="text-[11px] font-semibold tabular-nums"
                style={{ color: 'var(--color-fg-subtle)', minWidth: 36 }}
              >
                {seg.minuteLabel}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-pt-border)' }} />
            </div>
          )}
          <div className="flex items-start gap-3">
            {seg.speaker && (
              <span
                className="shrink-0 text-[11px] font-semibold tabular-nums"
                style={{
                  color: seg.speaker === 'Dr' ? 'var(--color-pt-accent)' : 'var(--color-fg-muted)',
                  minWidth: 24,
                  paddingTop: 2,
                }}
              >
                {seg.speaker}.
              </span>
            )}
            <p style={{ color: 'var(--color-pt-text)', margin: 0, flex: 1 }}>
              <HighlightedText
                text={seg.text}
                segmentIndex={si}
                allMatches={allMatches}
                activeMatchIndex={activeMatchIndex}
                activeRef={callbackRef}
              />
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HighlightedText({
  text,
  segmentIndex,
  allMatches,
  activeMatchIndex,
  activeRef,
}: {
  text: string;
  segmentIndex: number;
  allMatches: MatchPos[];
  activeMatchIndex: number;
  activeRef: (el: HTMLElement | null) => void;
}) {
  const segMatches = allMatches.filter((m) => m.segmentIndex === segmentIndex);
  if (segMatches.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  segMatches.forEach((m) => {
    if (cursor < m.charStart) parts.push(text.slice(cursor, m.charStart));
    const isActive = m.globalIndex === activeMatchIndex;
    parts.push(
      <mark
        key={m.charStart}
        ref={isActive ? activeRef : undefined}
        style={{
          background: isActive
            ? 'var(--color-pt-accent)'
            : 'color-mix(in oklab, var(--color-pt-accent) 25%, transparent)',
          color: isActive ? '#fff' : 'inherit',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {text.slice(m.charStart, m.charEnd)}
      </mark>,
    );
    cursor = m.charEnd;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export const TranscriptPanel = memo(TranscriptPanelImpl);
