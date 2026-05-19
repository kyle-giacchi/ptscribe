import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
}: DebugDrawerProps) {
  const [rawPayloadOpen, setRawPayloadOpen] = useState(false);
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
      <div
        style={{
          width: 320,
          height: '100%',
          background: 'var(--color-pt-surface)',
          borderLeft: '1px solid var(--color-pt-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(26,32,48,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-pt-border)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-fg)', flex: 1 }}>
            Debug tools
          </span>
          <button type="button" className="btn btn-ghost p-1.5" onClick={onClose}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Drawer body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
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
      </div>
    </div>
  );
}
