import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, RotateCcw, ChevronDown,
  Search, ChevronLeft, ChevronRight, Edit3, Wand2,
  Copy, List, Mic, EyeOff,
} from 'lucide-react';
import type { SessionClip } from '@/types';
import {
  mergeClipTranscriptsWithMarkers,
  stripClipMarkers,
} from '@/utils/clips';
import { parseTranscriptSegments, parseChunkedTranscript } from '@/utils/transcriptGrouping';
import { ConfirmBanner } from './ConfirmBanner';

// ── Main component ────────────────────────────────────────────────────────────

export function TranscriptPanel({
  transcript,
  clips,
  transcribing,
  hasUserEdits,
  hasT2Transcript,
  totalDurationSec,
  onChange,
  onCommit,
  onCreateTranscript,
  onRevertToLocal,
  onAddRecording,
  onViewRecordings,
  clipsCount,
  onCopyTranscript,
  onScrubPII,
  onApplyScrub,
  piiScrubbing,
  piiProgress,
  hasEditedTranscript,
  onRevertEdits,
}: {
  transcript: string;
  clips: SessionClip[];
  transcribing: boolean;
  hasUserEdits: boolean;
  hasT2Transcript: boolean;
  totalDurationSec: number;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCreateTranscript: (clipId?: string) => void;
  onRevertToLocal: () => void;
  onAddRecording?: () => void;
  onViewRecordings?: () => void;
  clipsCount?: number;
  onCopyTranscript?: () => void;
  onScrubPII?: (text: string) => Promise<{ scrubbed: string; entityCount: number }>;
  onApplyScrub?: (scrubbed: string) => void;
  piiScrubbing?: boolean;
  piiProgress?: string | null;
  hasEditedTranscript?: boolean;
  onRevertEdits?: () => void;
}) {
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [scrubResult, setScrubResult] = useState<{ scrubbed: string; entityCount: number } | null>(null);

  // Find & Replace (edit mode only)
  const [replaceStr, setReplaceStr] = useState('');
  const [replaceCount, setReplaceCount] = useState<number | null>(null);

  const transcribedClips = clips.filter(
    (c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0,
  );
  const showClipMarkers = transcribedClips.length > 1 && !hasUserEdits;
  const displayTranscript = showClipMarkers
    ? mergeClipTranscriptsWithMarkers(clips)
    : transcript;

  const chunkedSegments = clips.some((c) => c.transcriptChunks?.length)
    ? parseChunkedTranscript(clips)
    : null;
  const segments = chunkedSegments ?? parseTranscriptSegments(transcript, totalDurationSec);
  const allMatches = buildMatches(segments, searchQuery);
  const matchCount = allMatches.length;
  const safeIndex = matchCount > 0 ? matchIndex % matchCount : 0;

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


  async function handleScrubPII() {
    if (!onScrubPII) return;
    setScrubResult(null);
    try {
      const result = await onScrubPII(transcript);
      if (result.entityCount === 0) {
        toast.info('No PII detected in transcript');
      } else {
        setScrubResult(result);
      }
    } catch {
      toast.error('PII scan failed — try again');
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Scrub PII confirm banner ── */}
      {scrubResult !== null && (
        <ConfirmBanner
          message={`Found ${scrubResult.entityCount} PII item${scrubResult.entityCount !== 1 ? 's' : ''} — replace with redacted placeholders?`}
          confirmLabel="Apply redaction"
          onCancel={() => setScrubResult(null)}
          onConfirm={() => {
            onApplyScrub?.(scrubResult.scrubbed);
            setScrubResult(null);
            toast.success('PII redacted from transcript');
          }}
        />
      )}

      {/* ── Confirm banners ── */}
      {pendingOverwrite ? (
        <ConfirmBanner
          message="This will replace your edited transcript."
          confirmLabel="Yes, replace"
          onCancel={() => setPendingOverwrite(false)}
          onConfirm={() => { setPendingOverwrite(false); onCreateTranscript(); }}
        />
      ) : (
        (hasEditedTranscript || hasT2Transcript) && (
          <div className="flex flex-wrap items-center gap-2">
            {hasEditedTranscript && onRevertEdits && (
              <button type="button" className="btn btn-ghost" onClick={onRevertEdits}
                title="Clear your edits and show the original transcript.">
                <RotateCcw size={14} strokeWidth={2} /> Revert edits
              </button>
            )}
            {hasT2Transcript && (
              <button type="button" className="btn btn-ghost" onClick={onRevertToLocal}
                title="Restore the on-device draft transcript captured while you were recording.">
                <RotateCcw size={14} strokeWidth={2} /> Revert to draft transcript
              </button>
            )}
          </div>
        )
      )}

      {/* ── Panel ── */}
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-pt-border)' }}>

        {/* Panel header */}
        <div
          className="flex w-full items-center gap-2 px-3 py-2"
          style={{ background: 'var(--color-pt-surface-alt)', borderBottom: panelOpen ? '1px solid var(--color-pt-border)' : undefined }}
        >
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => setPanelOpen((o) => !o)}
          >
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--color-fg-muted)' }}>
              Transcript
            </span>
            {transcript.trim() && (
              <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {transcript.trim().split(/\s+/).filter(Boolean).length}w
              </span>
            )}
          </button>

          <div style={{ flex: 1 }} />

          {/* Contextual nav actions */}
          {onCopyTranscript && transcript.trim() && (
            <button type="button" className="btn btn-ghost p-1.5" onClick={onCopyTranscript} title="Copy transcript" aria-label="Copy transcript">
              <Copy size={13} strokeWidth={2} />
            </button>
          )}
          {onViewRecordings && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 28, padding: '0 8px', fontSize: 11.5 }}
              onClick={onViewRecordings}
            >
              <List size={12} strokeWidth={2} />
              {clipsCount != null && clipsCount > 0 ? `${clipsCount} Clip${clipsCount !== 1 ? 's' : ''}` : 'Clips'}
            </button>
          )}
          {onAddRecording && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ height: 28, padding: '0 8px', fontSize: 11.5 }}
              onClick={onAddRecording}
            >
              <Mic size={12} strokeWidth={2} /> Add Recording
            </button>
          )}

          {/* Search input (formatted view only) */}
          {panelOpen && !editMode && (
            <div className="relative flex items-center">
              <Search size={12} strokeWidth={2} style={{ position: 'absolute', left: 7, color: 'var(--color-fg-subtle)', pointerEvents: 'none' }} />
              <input
                type="text"
                aria-label="Search transcript"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setMatchIndex(0); }}
                className="input h-7 py-0 text-xs"
                style={{ paddingLeft: 24, paddingRight: searchQuery ? 56 : 8, width: 140 }}
              />
              {searchQuery && (
                <>
                  <span className="absolute text-[10px] tabular-nums" style={{ right: 44, color: 'var(--color-fg-subtle)' }}>
                    {matchCount > 0 ? `${safeIndex + 1}/${matchCount}` : '0'}
                  </span>
                  <button type="button" className="absolute flex items-center justify-center"
                    style={{ right: 24, width: 18, height: 18, color: 'var(--color-fg-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setMatchIndex((i) => (i - 1 + matchCount) % Math.max(matchCount, 1))}>
                    <ChevronLeft size={11} strokeWidth={2.5} />
                  </button>
                  <button type="button" className="absolute flex items-center justify-center"
                    style={{ right: 6, width: 18, height: 18, color: 'var(--color-fg-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setMatchIndex((i) => (i + 1) % Math.max(matchCount, 1))}>
                    <ChevronRight size={11} strokeWidth={2.5} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Edit mode toggle */}
          {panelOpen && transcript.trim() && (
            <button type="button" className="btn btn-ghost p-1.5"
              title={editMode ? 'Switch to formatted view' : 'Edit transcript'}
              onClick={() => setEditMode((m) => !m)}
              style={{ color: editMode ? 'var(--color-pt-accent)' : 'var(--color-fg-subtle)' }}>
              <Edit3 size={13} strokeWidth={2} />
            </button>
          )}

          {/* Hide/show toggle */}
          <button type="button" className="btn btn-ghost p-1.5"
            onClick={() => setPanelOpen((o) => !o)}
            style={{ color: 'var(--color-fg-subtle)' }}
            title={panelOpen ? 'Hide transcript' : 'Show transcript'}>
            <ChevronDown size={13} strokeWidth={2}
              style={{ transform: panelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease-out' }} />
          </button>
        </div>

        {/* Panel body */}
        <div style={{ display: 'grid', gridTemplateRows: panelOpen ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease-out' }}>
          <div style={{ overflow: 'hidden' }}>
            {/* Improve with AI + Scrub PII — above the text editor */}
            {transcript.trim() && (
              <div
                className="flex items-center gap-1 px-3 py-2"
                style={{ borderBottom: '1px solid var(--color-pt-border)', background: 'var(--color-pt-surface-alt)' }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  disabled={transcribing}
                  onClick={handleCreateClick}
                  title="Re-transcribe using cloud AI (silence trimmed + sped up) for a cleaner result."
                >
                  {transcribing
                    ? <><Loader2 size={13} className="animate-spin" /> Transcribing…</>
                    : <><Wand2 size={13} strokeWidth={2} /> Improve with AI</>}
                </button>
                {onScrubPII && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 12 }}
                    disabled={piiScrubbing}
                    onClick={handleScrubPII}
                    title="Scan transcript for names, dates, phone numbers, and other PII — replaces them with labeled placeholders."
                  >
                    {piiScrubbing
                      ? <><Loader2 size={13} className="animate-spin" /> {piiProgress ?? 'Scanning…'}</>
                      : <><EyeOff size={13} strokeWidth={2} /> Scrub PII</>}
                  </button>
                )}
              </div>
            )}

            {editMode ? (
              /* Edit mode: find & replace + textarea */
              <>
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                  style={{ borderBottom: '1px solid var(--color-pt-border)', background: 'var(--color-pt-surface-alt)' }}
                >
                  <input type="text" aria-label="Find" className="input h-7 py-0 text-sm" style={{ width: '10rem' }}
                    placeholder="Find" value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setReplaceCount(null); }} />
                  <input type="text" aria-label="Replace with" className="input h-7 py-0 text-sm" style={{ width: '10rem' }}
                    placeholder="Replace with" value={replaceStr}
                    onChange={(e) => setReplaceStr(e.target.value)} />
                  <button type="button" className="btn btn-secondary"
                    style={{ height: '1.75rem', paddingTop: 0, paddingBottom: 0 }}
                    disabled={!searchQuery} onClick={handleReplaceAll}>
                    Replace All
                  </button>
                  {replaceCount !== null && (
                    <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                      {replaceCount === 0 ? 'No matches' : `Replaced ${replaceCount} occurrence${replaceCount !== 1 ? 's' : ''}`}
                    </span>
                  )}
                </div>
                <textarea
                  className="input min-h-48 w-full rounded-none leading-relaxed"
                  style={{ borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderTop: '1px solid var(--color-pt-border)' }}
                  placeholder="Speak while recording, paste in a transcript, or type freely."
                  value={displayTranscript}
                  onChange={(e) => handleTranscriptChange(e.target.value)}
                  onBlur={onCommit}
                />
              </>
            ) : (
              /* Formatted view */
              <FormattedTranscriptView
                segments={segments}
                searchQuery={searchQuery}
                activeMatchIndex={safeIndex}
                transcript={transcript}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Formatted transcript view ─────────────────────────────────────────────────

interface MatchPos {
  segmentIndex: number;
  charStart: number;
  charEnd: number;
  globalIndex: number;
}

function buildMatches(segments: ReturnType<typeof parseTranscriptSegments>, query: string): MatchPos[] {
  if (!query) return [];
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const result: MatchPos[] = [];
  let globalIndex = 0;
  segments.forEach((seg, si) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg.text)) !== null) {
      result.push({ segmentIndex: si, charStart: m.index, charEnd: m.index + m[0].length, globalIndex });
      globalIndex++;
    }
  });
  return result;
}

function FormattedTranscriptView({
  segments, searchQuery, activeMatchIndex, transcript,
}: {
  segments: ReturnType<typeof parseTranscriptSegments>;
  searchQuery: string;
  activeMatchIndex: number;
  transcript: string;
}) {
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

  const allMatches = buildMatches(segments, searchQuery);

  return (
    <div
      className="overflow-y-auto px-4 py-3 space-y-3"
      style={{ maxHeight: 460, fontSize: 13, lineHeight: '1.7' }}
    >
      {segments.map((seg, si) => (
        <div key={si}>
          {/* Minute divider */}
          {seg.showMinuteDivider && (
            <div className="flex items-center gap-2 my-3" aria-label={`Timestamp ${seg.minuteLabel}`}>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--color-fg-subtle)', minWidth: 36 }}>
                {seg.minuteLabel}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-pt-border)' }} />
            </div>
          )}

          {/* Segment row */}
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
  text, segmentIndex, allMatches, activeMatchIndex, activeRef,
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
          background: isActive ? 'var(--color-pt-accent)' : 'color-mix(in oklab, var(--color-pt-accent) 25%, transparent)',
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
