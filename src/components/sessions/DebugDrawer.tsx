import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import type { AiDebugPrompts } from '@/types';

export interface DebugDrawerStats {
  droppedSec: number;
  originalSec: number;
  speedSavedSec: number;
  speedOriginalSec: number;
}

export interface DebugDrawerProps {
  onClose: () => void;
  silenceDebugOn: boolean;
  setSilenceDebugOn: (v: boolean) => void;
  speedDebugOn: boolean;
  setSpeedDebugOn: (v: boolean) => void;
  debugStats: DebugDrawerStats | null;
  speedFactor: number;
  lastRawPayload?: string | null;
  lastAiPrompts?: AiDebugPrompts | null;
}

/**
 * Right-side debug drawer surfaced from the Session page's gear icon. Shows
 * silence-trim and speed-up stats from the most recent cloud transcription
 * pass; both panels render placeholder copy until `debugStats` is populated.
 */
export function DebugDrawer({
  onClose,
  silenceDebugOn,
  setSilenceDebugOn,
  speedDebugOn,
  setSpeedDebugOn,
  debugStats,
  speedFactor,
  lastRawPayload,
  lastAiPrompts,
}: DebugDrawerProps) {
  const [rawPayloadOpen, setRawPayloadOpen] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.22)',
        }}
      />

      {/* Slide-in card */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'tween', duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          width: 'min(500px, 100vw)',
          height: '100%',
          background: 'var(--color-pt-surface)',
          borderLeft: '1px solid var(--color-pt-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(26,32,48,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            height: 56,
            borderBottom: '1px solid var(--color-pt-border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-pt-text)', flex: 1 }}>
            Debug Tools
          </span>
          <button type="button" className="btn btn-ghost p-1.5" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* ── Silence visibility ──────────────────────── */}
          <div
            style={{
              borderRadius: 10,
              border: '1px solid var(--color-pt-border)',
              overflow: 'hidden',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                cursor: 'pointer',
                background: 'var(--color-pt-surface-alt)',
              }}
            >
              <input
                type="checkbox"
                checked={silenceDebugOn}
                onChange={(e) => setSilenceDebugOn(e.target.checked)}
                style={{ accentColor: 'var(--color-pt-accent)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)' }}>
                Silence visibility
              </span>
            </label>
            {silenceDebugOn && (
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                {debugStats && debugStats.originalSec > 0 ? (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-fg)' }}>
                        {Math.round(debugStats.droppedSec)}s
                      </span>{' '}
                      trimmed (
                      {Math.round((debugStats.droppedSec / debugStats.originalSec) * 100)}% of
                      recording)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                      {Math.round(debugStats.originalSec)}s original →{' '}
                      {Math.round(debugStats.originalSec - debugStats.droppedSec)}s after trim
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Run transcription to see silence data.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Speed-up visibility ─────────────────────── */}
          <div
            style={{
              borderRadius: 10,
              border: '1px solid var(--color-pt-border)',
              overflow: 'hidden',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                cursor: 'pointer',
                background: 'var(--color-pt-surface-alt)',
              }}
            >
              <input
                type="checkbox"
                checked={speedDebugOn}
                onChange={(e) => setSpeedDebugOn(e.target.checked)}
                style={{ accentColor: 'var(--color-pt-accent)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)' }}>
                Speed-up visibility
              </span>
            </label>
            {speedDebugOn && (
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                {debugStats && debugStats.speedOriginalSec > 0 ? (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-fg)' }}>
                        {Math.round(debugStats.speedSavedSec)}s
                      </span>{' '}
                      saved (
                      {Math.round((debugStats.speedSavedSec / debugStats.speedOriginalSec) * 100)}%
                      speedup)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)' }}>
                      Speed factor:{' '}
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--color-fg)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {speedFactor}×
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Run transcription to see speed-up data.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── AI prompt ───────────────────────────────── */}
          <div
            style={{
              borderRadius: 10,
              border: '1px solid var(--color-pt-border)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                width: '100%',
                background: 'var(--color-pt-surface-alt)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onClick={() => setAiPromptOpen((v) => !v)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
                AI prompt
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                {aiPromptOpen ? '▲' : '▼'}
              </span>
            </button>
            {aiPromptOpen && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lastAiPrompts ? (
                  <>
                    {(
                      [
                        { label: 'System', value: lastAiPrompts.system },
                        ...(lastAiPrompts.modifierBlock
                          ? [{ label: 'Modifiers', value: lastAiPrompts.modifierBlock }]
                          : []),
                        { label: 'User', value: lastAiPrompts.user },
                      ] as { label: string; value: string }[]
                    ).map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {label}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                            onClick={() => {
                              void navigator.clipboard.writeText(value).then(
                                () => toast.success('Copied'),
                                () => toast.error('Copy failed'),
                              );
                            }}
                          >
                            <Copy size={11} strokeWidth={2} />
                            Copy
                          </button>
                        </div>
                        <pre
                          style={{
                            fontSize: 10.5,
                            color: 'var(--color-fg-subtle)',
                            background: 'var(--color-pt-surface)',
                            border: '1px solid var(--color-pt-border)',
                            borderRadius: 6,
                            padding: '8px 10px',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: 200,
                            overflowY: 'auto',
                            margin: 0,
                          }}
                        >
                          {value}
                        </pre>
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Generate a note to see the AI prompt.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── AI raw response ─────────────────────────── */}
          <div
            style={{
              borderRadius: 10,
              border: '1px solid var(--color-pt-border)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                width: '100%',
                background: 'var(--color-pt-surface-alt)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onClick={() => setRawPayloadOpen((v) => !v)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
                AI raw response
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                {rawPayloadOpen ? '▲' : '▼'}
              </span>
            </button>
            {rawPayloadOpen && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lastRawPayload ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                      onClick={() => {
                        void navigator.clipboard.writeText(lastRawPayload).then(
                          () => toast.success('Copied'),
                          () => toast.error('Copy failed'),
                        );
                      }}
                    >
                      <Copy size={11} strokeWidth={2} />
                      Copy
                    </button>
                    <pre
                      style={{
                        fontSize: 10.5,
                        color: 'var(--color-fg-subtle)',
                        background: 'var(--color-pt-surface)',
                        border: '1px solid var(--color-pt-border)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 320,
                        overflowY: 'auto',
                        margin: 0,
                      }}
                    >
                      {lastRawPayload}
                    </pre>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Generate a note to see the raw AI response.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
