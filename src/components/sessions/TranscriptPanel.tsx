import { useState } from 'react';
import { Sparkles, Loader2, Layers, Info, RotateCcw, ChevronDown, Search } from 'lucide-react';
import type { SessionClip } from '@/types';
import {
  getTranscribableClips,
  mergeClipTranscriptsWithMarkers,
  stripClipMarkers,
} from '@/utils/clips';
import { ConfirmBanner } from './ConfirmBanner';

function CreateTranscriptButton({
  busy,
  disabled,
  used,
  cap,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  used: number;
  cap: number;
  onClick: () => void;
}) {
  const buttonTitle = disabled
    ? `Per-session limit reached (${used}/${cap}). Reload to reset.`
    : `Transcribe with AI (${used}/${cap} used).`;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy || disabled}
        onClick={onClick}
        title={buttonTitle}
      >
        {busy ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Transcribing…
          </>
        ) : (
          <>
            <Sparkles size={14} strokeWidth={2} /> Generate AI Transcription
          </>
        )}
      </button>
      <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-fg-subtle)' }}>
        {used}/{cap}
      </span>
      <button
        type="button"
        className="btn btn-ghost p-0.5"
        aria-label="About AI transcription"
        title="Uses cloud AI speech recognition with speaker identification — knows who's speaking (patient vs. clinician) for cleaner, more structured transcripts and better note generation."
        style={{ color: 'var(--color-fg-subtle)', lineHeight: 0 }}
      >
        <Info size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

export function TranscriptPanel({
  transcript,
  clips,
  canRemerge,
  canTranscribe,
  transcribing,
  transcribeUsed,
  transcribeCap,
  hasUserEdits,
  hasLocalTranscript,
  onChange,
  onCommit,
  onRemerge,
  onCreateTranscript,
  onRevertToLocal,
}: {
  transcript: string;
  clips: SessionClip[];
  canRemerge: boolean;
  canTranscribe: boolean;
  transcribing: boolean;
  transcribeUsed: number;
  transcribeCap: number;
  hasUserEdits: boolean;
  hasLocalTranscript: boolean;
  onChange: (next: string) => void;
  onCommit: () => void;
  onRemerge: () => void;
  onCreateTranscript: (clipId?: string) => void;
  onRevertToLocal: () => void;
}) {
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const [pendingRemerge, setPendingRemerge] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [fnrOpen, setFnrOpen] = useState(false);
  const [findStr, setFindStr] = useState('');
  const [replaceStr, setReplaceStr] = useState('');
  const [replaceCount, setReplaceCount] = useState<number | null>(null);
  const transcribableClips = getTranscribableClips(clips);
  const latestId = transcribableClips.at(-1)?.id ?? '';
  const [selectedClipId, setSelectedClipId] = useState(latestId);
  const activeClipId = transcribableClips.some((c) => c.id === selectedClipId)
    ? selectedClipId
    : latestId;

  const budgetSpent = transcribeUsed >= transcribeCap;

  // H8: build a display-only value that inserts --- [Clip N] --- dividers when
  // the transcript is an unedited merge of multiple clips.  The markers are
  // stripped back out in onChange so they are never written to stored state.
  const transcribedClips = clips.filter(
    (c) => c.status === 'transcribed' && c.transcript && c.transcript.trim().length > 0,
  );
  const showClipMarkers =
    transcribedClips.length > 1 && !hasUserEdits;
  const displayTranscript = showClipMarkers
    ? mergeClipTranscriptsWithMarkers(clips, clips)
    : transcript;

  function handleTranscriptChange(next: string) {
    // Strip any clip-marker lines the user may have accidentally edited around.
    onChange(showClipMarkers ? stripClipMarkers(next) : next);
  }

  function handleCreateClick() {
    if (hasUserEdits) {
      setPendingOverwrite(true);
    } else {
      onCreateTranscript(transcribableClips.length > 1 ? activeClipId : undefined);
    }
  }

  function handleRemergeClick() {
    // H9: only gate on user edits — if the transcript already equals the clip
    // merge there is nothing at risk, so skip the confirm banner.
    if (hasUserEdits) {
      setPendingRemerge(true);
    } else {
      onRemerge();
    }
  }

  function handleReplaceAll() {
    if (!findStr) return;
    const regex = new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = (transcript.match(regex) ?? []).length;
    onChange(transcript.replace(regex, replaceStr));
    onCommit();
    setReplaceCount(count);
  }

  const showActionRow = canTranscribe || canRemerge || hasLocalTranscript;

  return (
    <div className="space-y-3">
      {pendingOverwrite ? (
        <ConfirmBanner
          message="This will replace your edited transcript."
          confirmLabel="Yes, replace"
          onCancel={() => setPendingOverwrite(false)}
          onConfirm={() => {
            setPendingOverwrite(false);
            onCreateTranscript(transcribableClips.length > 1 ? activeClipId : undefined);
          }}
        />
      ) : pendingRemerge ? (
        <ConfirmBanner
          message="You have manual edits that will be lost when clips are re-merged."
          confirmLabel="Yes, discard edits"
          onCancel={() => setPendingRemerge(false)}
          onConfirm={() => {
            setPendingRemerge(false);
            onRemerge();
          }}
        />
      ) : showActionRow ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {canTranscribe && (
              <>
                {transcribableClips.length > 1 && (
                  <select
                    className="input h-8 py-0 text-sm"
                    value={activeClipId}
                    onChange={(e) => setSelectedClipId(e.target.value)}
                    disabled={transcribing}
                  >
                    {transcribableClips.map((c) => (
                      <option key={c.id} value={c.id}>
                        Clip {clips.findIndex((x) => x.id === c.id) + 1}
                      </option>
                    ))}
                  </select>
                )}
                <CreateTranscriptButton
                  busy={transcribing}
                  disabled={budgetSpent}
                  used={transcribeUsed}
                  cap={transcribeCap}
                  onClick={handleCreateClick}
                />
              </>
            )}
            {canRemerge && (
              <button type="button" className="btn btn-ghost" onClick={handleRemergeClick}>
                <Layers size={14} strokeWidth={2} /> Re-merge from clips
              </button>
            )}
            {hasLocalTranscript && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onRevertToLocal}
                title="Restore the on-device draft transcript captured while you were recording."
              >
                <RotateCcw size={14} strokeWidth={2} /> Revert to draft transcript
              </button>
            )}
          </div>
          {canTranscribe && budgetSpent && (
            <p className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Session limit reached — reload the page to reset.
            </p>
          )}
        </div>
      ) : null}
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--color-pt-border)' }}
      >
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left"
          style={{ background: 'var(--color-pt-surface-alt)' }}
          onClick={() => setTranscriptOpen((o) => !o)}
        >
          <span
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Transcript
          </span>
          <div className="flex items-center gap-2">
            {transcript.trim() && (
              <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {transcript.trim().split(/\s+/).filter(Boolean).length}w
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost p-0.5"
              aria-label="Find and replace"
              title="Find & Replace"
              onClick={(e) => {
                e.stopPropagation();
                setFnrOpen((o) => !o);
                setReplaceCount(null);
              }}
              style={{
                color: fnrOpen ? 'var(--color-pt-accent)' : 'var(--color-fg-subtle)',
                lineHeight: 0,
              }}
            >
              <Search size={13} strokeWidth={2} />
            </button>
            <ChevronDown
              size={13}
              strokeWidth={2}
              style={{
                color: 'var(--color-fg-subtle)',
                transform: transcriptOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease-out',
              }}
            />
          </div>
        </button>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: transcriptOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 200ms ease-out',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            {fnrOpen && (
              <div
                className="flex flex-wrap items-center gap-2 px-3 py-2"
                style={{ borderTop: '1px solid var(--color-pt-border)', background: 'var(--color-pt-surface-alt)' }}
              >
                <input
                  type="text"
                  className="input h-7 py-0 text-sm"
                  style={{ width: '10rem' }}
                  placeholder="Find"
                  value={findStr}
                  onChange={(e) => { setFindStr(e.target.value); setReplaceCount(null); }}
                />
                <input
                  type="text"
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
                  disabled={!findStr}
                  onClick={handleReplaceAll}
                >
                  Replace All
                </button>
                {replaceCount !== null && (
                  <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    {replaceCount === 0 ? 'No matches' : `Replaced ${replaceCount} occurrence${replaceCount !== 1 ? 's' : ''}`}
                  </span>
                )}
              </div>
            )}
            <textarea
              className="input min-h-48 w-full rounded-none leading-relaxed"
              style={{
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                borderTop: '1px solid var(--color-pt-border)',
              }}
              placeholder="Speak while recording, paste in a transcript, or type freely."
              value={displayTranscript}
              onChange={(e) => handleTranscriptChange(e.target.value)}
              onBlur={onCommit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
