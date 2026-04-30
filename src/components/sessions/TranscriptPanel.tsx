import { useState } from 'react';
import { Sparkles, Loader2, Layers, Info, AlertTriangle, RotateCcw } from 'lucide-react';
import type { SessionClip } from '@/types';

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
            <span className="ml-1 text-[10px] tabular-nums opacity-60">
              {used}/{cap}
            </span>
          </>
        )}
      </button>
      <span
        title="Uses cloud AI speech recognition with speaker identification — knows who's speaking (patient vs. clinician) for cleaner, more structured transcripts and better note generation."
        className="cursor-help"
        style={{ color: 'var(--color-fg-subtle)', lineHeight: 0 }}
      >
        <Info size={13} strokeWidth={2} />
      </span>
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
  const transcribableClips = clips.filter(
    (c) =>
      c.status === 'ready' ||
      c.status === 'failed' ||
      (c.status === 'transcribed' && !!c.localTranscript && c.transcript === c.localTranscript),
  );
  const latestId = transcribableClips.at(-1)?.id ?? '';
  const [selectedClipId, setSelectedClipId] = useState(latestId);
  const activeClipId = transcribableClips.some((c) => c.id === selectedClipId)
    ? selectedClipId
    : latestId;

  const budgetSpent = transcribeUsed >= transcribeCap;

  function handleCreateClick() {
    if (hasUserEdits) {
      setPendingOverwrite(true);
    } else {
      onCreateTranscript(transcribableClips.length > 1 ? activeClipId : undefined);
    }
  }

  function handleRemergeClick() {
    if (transcript.trim().length > 0) {
      setPendingRemerge(true);
    } else {
      onRemerge();
    }
  }

  const cautionBannerStyle = {
    borderColor: 'var(--color-caution)',
    background: 'color-mix(in oklab, var(--color-caution) 8%, transparent)',
  };

  const showActionRow = canTranscribe || canRemerge || hasLocalTranscript;

  return (
    <div className="space-y-3">
      {pendingOverwrite ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
          style={cautionBannerStyle}
        >
          <AlertTriangle
            size={13}
            strokeWidth={2}
            style={{ color: 'var(--color-caution)', flexShrink: 0 }}
          />
          <span style={{ color: 'var(--color-caution)' }}>
            This will replace your edited transcript.
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="btn btn-ghost py-0.5 text-xs"
              onClick={() => setPendingOverwrite(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary py-0.5 text-xs"
              onClick={() => {
                setPendingOverwrite(false);
                onCreateTranscript(transcribableClips.length > 1 ? activeClipId : undefined);
              }}
            >
              Yes, replace
            </button>
          </div>
        </div>
      ) : pendingRemerge ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
          style={cautionBannerStyle}
        >
          <AlertTriangle
            size={13}
            strokeWidth={2}
            style={{ color: 'var(--color-caution)', flexShrink: 0 }}
          />
          <span style={{ color: 'var(--color-caution)' }}>
            This will replace the current transcript.
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="btn btn-ghost py-0.5 text-xs"
              onClick={() => setPendingRemerge(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary py-0.5 text-xs"
              onClick={() => {
                setPendingRemerge(false);
                onRemerge();
              }}
            >
              Yes, replace
            </button>
          </div>
        </div>
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
              <button type="button" className="btn btn-ghost" onClick={onRevertToLocal}>
                <RotateCcw size={14} strokeWidth={2} /> Use Local Transcription
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
      <textarea
        className="input min-h-48 leading-relaxed"
        placeholder="Speak while recording, paste in a transcript, or type freely."
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </div>
  );
}
