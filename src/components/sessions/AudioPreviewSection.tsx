import { useState, type ReactNode } from 'react';
import { Info, ChevronDown, Loader2 } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { Select, TextInput } from '@/components/ui/Field';
import { BlobWaveform } from '@/components/audio/BlobWaveform';

// ── Audio track row within AudioPreviewSection ─────────────────────────────────
function AudioTrackRow({
  label,
  savedSec,
  note,
  children,
}: {
  label: string;
  savedSec?: number | null;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg"
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-alt)',
        padding: '10px 12px',
      }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-pt-text-2)' }}
        >
          {label}
        </span>
        {savedSec != null && savedSec > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: 'var(--color-pt-accent-soft)',
              color: 'var(--color-pt-accent-fg)',
              border: '1px solid var(--color-pt-accent-border)',
            }}
          >
            −{savedSec.toFixed(1)}s saved
          </span>
        )}
        {note && (
          <span className="text-[10px]" style={{ color: 'var(--color-pt-text-3)' }}>
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Collapsible audio preview + processing section ────────────────────────────
export function AudioPreviewSection({
  mergedAudioBlob,
  silencedMergedBlob,
}: {
  mergedAudioBlob: Blob;
  /** Pre-computed silence-removed combined blob from buildMergedAudioForReview. */
  silencedMergedBlob: Blob | null;
}) {
  const { settings, updateAudio } = useSettings();
  const [open, setOpen] = useState(true);

  const {
    activeSilenced,
    compilingSilence,
    activeSilenceError,
    compileSilence,
    resetSilence,
  } = useAudioProcessing(mergedAudioBlob, silencedMergedBlob);

  const sd = settings.audio.silenceDetection;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
      }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          borderBottom: open ? '1px solid var(--color-pt-border)' : undefined,
        }}
      >
        <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--color-pt-text)' }}>
          Combined Audio
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse audio preview' : 'Expand audio preview'}
          className="flex items-center justify-center rounded p-1 transition-colors hover:bg-[var(--color-pt-surface-alt)]"
          style={{ touchAction: 'manipulation' }}
        >
          <ChevronDown
            size={15}
            strokeWidth={2}
            style={{
              color: 'var(--color-pt-text-3)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease',
            }}
          />
        </button>
      </div>

      {open && (
        <div className="space-y-2 px-4 pb-4 pt-3">
          <AudioTrackRow label="Full Audio">
            <BlobWaveform blob={mergedAudioBlob} />
          </AudioTrackRow>

          <AudioTrackRow label="Silence Removed" savedSec={activeSilenced?.savedSec}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sd.enabled}
                    onChange={(e) =>
                      updateAudio({ silenceDetection: { ...sd, enabled: e.target.checked } })
                    }
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-pt-text-2)' }}
                  >
                    Silence trimming
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost p-0.5"
                  aria-label="About silence trimming"
                  title={
                    'Removes quiet gaps before transcription. The original recording is never changed.\n\n' +
                    'Sensitivity:\n' +
                    '  • Aggressive — best for long dead-air gaps.\n' +
                    '  • Balanced — recommended for most PT sessions.\n' +
                    '  • Relaxed — only drops very long, obvious silences.\n\n' +
                    'Pad (ms) keeps audio around speech edges to avoid clipping words. Try 400–600 ms if sentences are cut off.'
                  }
                  style={{ color: 'var(--color-pt-text-3)', lineHeight: 0 }}
                >
                  <Info size={13} />
                </button>
                {sd.enabled && (
                  <>
                    <label className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>
                        Sensitivity
                      </span>
                      <Select
                        value={sd.sensitivity}
                        className="h-7 py-0 text-xs"
                        onChange={(e) =>
                          updateAudio({
                            silenceDetection: {
                              ...sd,
                              sensitivity: e.target.value as 'low' | 'medium' | 'high',
                            },
                          })
                        }
                      >
                        <option value="low">Aggressive</option>
                        <option value="medium">Balanced</option>
                        <option value="high">Relaxed</option>
                      </Select>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--color-pt-text-2)' }}>
                        Pad (ms)
                      </span>
                      <TextInput
                        type="number"
                        min={0}
                        max={2000}
                        step={50}
                        value={String(sd.padMs)}
                        className="h-7 w-20 py-0 text-xs"
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(2000, Number(e.target.value) || 0));
                          updateAudio({ silenceDetection: { ...sd, padMs: n } });
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
              {sd.enabled &&
                (activeSilenced ? (
                  <div className="space-y-1.5">
                    <BlobWaveform blob={activeSilenced.blob} />
                    <button
                      type="button"
                      className="btn btn-ghost py-0.5 text-[11px]"
                      onClick={resetSilence}
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      disabled={compilingSilence}
                      onClick={() => void compileSilence()}
                    >
                      {compilingSilence ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Applying…
                        </>
                      ) : (
                        'Apply'
                      )}
                    </button>
                    {activeSilenceError && (
                      <p className="text-[11px]" style={{ color: 'var(--color-negative)' }}>
                        {activeSilenceError}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </AudioTrackRow>
        </div>
      )}
    </div>
  );
}
