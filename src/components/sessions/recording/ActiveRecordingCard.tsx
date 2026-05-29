import { useState } from 'react';
import { Square, Pause, Play } from 'lucide-react';
import { Waveform } from '@/components/design/Waveform';
import type { MicState } from '@/components/design/MicStatusPill';
import type { UseWebSpeechTranscript } from '@/hooks/useLiveTranscript';
import { LiveTranscriptView } from './LiveTranscriptView';
import { RecordingTimer } from '../RecordingTimer';

// ── Active recording state ─────────────────────────────────────────────────────
export function ActiveRecordingCard({
  subscribeDuration,
  getDurationSec,
  paused,
  chainActive,
  analyser,
  webSpeech,
  whisperBubbles,
  wasmSupported,
  onPauseResume,
  onStopAndFinish,
}: {
  subscribeDuration: (cb: () => void) => () => void;
  getDurationSec: () => number;
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
            <RecordingTimer
              subscribeDuration={subscribeDuration}
              getDurationSec={getDurationSec}
              className="font-mono font-semibold tabular-nums"
              style={{
                color: 'var(--color-pt-text)',
                fontSize: 40,
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            />
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
