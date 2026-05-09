import { useState } from 'react';
import { Sparkles, Loader2, Layers, Info, RotateCcw } from 'lucide-react';
import type { SessionClip } from '@/types';
import { getTranscribableClips } from '@/utils/clips';
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
  const transcribableClips = getTranscribableClips(clips);
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
          message="This will replace the current transcript."
          confirmLabel="Yes, replace"
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
