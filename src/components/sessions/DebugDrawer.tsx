import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import type { AiDebugPrompts, AiErrorEntry, GenerateKeyReport, Session } from '@/types';
import type { PiiScrubDebug } from '@/contexts/DebugDrawerProvider';
import { EnvironmentPanel, FeaturesPanel, StoragePanel } from './debug/EnvPanels';
import { SessionAudioPanel } from './debug/SessionAudioPanel';
import { TranscriptPanel } from './debug/TranscriptPanel';

export interface DebugDrawerStats {
  droppedSec: number;
  originalSec: number;
  speedSavedSec: number;
  speedOriginalSec: number;
}

export interface DebugDrawerProps {
  onClose: () => void;
  /** Session id whose panels are shown, or null when opened off-session. */
  activeSessionId?: string | null;
  /** Full active session entity, for the audio/transcript inspection panels. */
  activeSession?: Session | null;
  debugStats: DebugDrawerStats | null;
  speedFactor: number;
  lastRawPayload?: string | null;
  lastAiPrompts?: AiDebugPrompts | null;
  lastKeyReport?: GenerateKeyReport | null;
  /** Most recent on-device PII scrub run in the active session. */
  lastPiiScrub?: PiiScrubDebug | null;
  /** Persisted per-session AI-call error log (newest rendered first). */
  aiErrors?: AiErrorEntry[];
  /** Clears the active session's error log; omit to hide the action. */
  onClearErrors?: () => void;
}

/**
 * App-global right-side debug drawer, opened from Settings → Debug Menu. Shows
 * silence-trim and speed-up stats plus AI prompt/payload/response inspection for
 * the active session; session-scoped panels render placeholder copy when opened
 * off-session or before data is populated.
 */
export function DebugDrawer({
  onClose,
  activeSessionId,
  activeSession,
  debugStats,
  speedFactor,
  lastRawPayload,
  lastAiPrompts,
  lastKeyReport,
  lastPiiScrub,
  aiErrors,
  onClearErrors,
}: DebugDrawerProps) {
  const [silenceDebugOn, setSilenceDebugOn] = useState(false);
  const [speedDebugOn, setSpeedDebugOn] = useState(false);
  const [rawPayloadOpen, setRawPayloadOpen] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [requestPayloadOpen, setRequestPayloadOpen] = useState(false);
  const [keyMapOpen, setKeyMapOpen] = useState(false);
  const [piiOpen, setPiiOpen] = useState(false);
  const [errorLogOpen, setErrorLogOpen] = useState(false);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const hasSession = Boolean(activeSessionId);

  // Newest first; the ring buffer stores oldest→newest.
  const errorsNewestFirst = aiErrors ? [...aiErrors].reverse() : [];

  // Classify the section-key comparison so the panel header signals the
  // verdict at a glance, matching the toast logic in useGeneratePhase.
  const keyStatus = !lastKeyReport
    ? null
    : lastKeyReport.returned.length > 0 && lastKeyReport.matched.length === 0
      ? { label: 'Key mismatch', color: 'var(--color-pt-danger, #c0392b)' }
      : lastKeyReport.missing.length > 0 || lastKeyReport.unexpected.length > 0
        ? { label: 'Partial match', color: 'var(--color-pt-warn, #b7791f)' }
        : { label: 'All matched', color: 'var(--color-pt-success, #2f855a)' };

  // Exact JSON body the browser POSTs to /api/generate (forwarded to Anthropic
  // by the Worker). maxTokens/temperature/cacheSystem are omitted because the
  // generate flow leaves them unset — JSON.stringify drops undefined fields.
  const requestPayloadJson = lastAiPrompts
    ? JSON.stringify(
        {
          model: lastAiPrompts.model,
          system: lastAiPrompts.system,
          modifierBlock: lastAiPrompts.modifierBlock,
          user: lastAiPrompts.user,
        },
        null,
        2,
      )
    : null;
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
            Debug Menu
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
          {!hasSession && (
            <div
              style={{
                borderRadius: 10,
                border: '1px dashed var(--color-pt-border)',
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--color-fg-subtle)',
                background: 'var(--color-pt-surface-alt)',
              }}
            >
              No active session — open one to inspect its transcription, prompts, and AI response.
              Global panels still work.
            </div>
          )}

          {/* ── Error log (persisted per-session AI failures) ── */}
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
              onClick={() => setErrorLogOpen((v) => !v)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
                Error log
              </span>
              {errorsNewestFirst.length > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    background: 'var(--color-pt-danger, #c0392b)',
                    borderRadius: 999,
                    padding: '1px 7px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {errorsNewestFirst.length}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                {errorLogOpen ? '▲' : '▼'}
              </span>
            </button>
            {errorLogOpen && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {errorsNewestFirst.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    {hasSession
                      ? 'No AI-call errors recorded for this session.'
                      : 'Open a session to see its recorded AI-call errors.'}
                  </div>
                ) : (
                  <>
                    {onClearErrors && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ alignSelf: 'flex-end', fontSize: 11 }}
                        onClick={onClearErrors}
                      >
                        Clear errors
                      </button>
                    )}
                    {errorsNewestFirst.map((entry) => {
                      const expanded = expandedErrorId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          style={{
                            borderRadius: 8,
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
                              width: '100%',
                              padding: '8px 10px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                            onClick={() => setExpandedErrorId(expanded ? null : entry.id)}
                          >
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: 'var(--color-pt-danger, #c0392b)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {entry.kind}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--color-fg)', flex: 1 }}>
                              {entry.call}
                              {entry.provider ? ` · ${entry.provider}` : ''}
                            </span>
                            <span style={{ fontSize: 10.5, color: 'var(--color-fg-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                              {new Date(entry.ts).toLocaleTimeString()}
                            </span>
                          </button>
                          {expanded && (
                            <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ fontSize: 10.5, color: 'var(--color-fg-subtle)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                {entry.status !== undefined && <span>status {entry.status}</span>}
                                {entry.latencyMs !== undefined && <span>{entry.latencyMs}ms</span>}
                                {entry.attempts !== undefined && <span>{entry.attempts} attempt(s)</span>}
                                <span>{new Date(entry.ts).toLocaleString()}</span>
                              </div>
                              {entry.detail && (
                                <div style={{ fontSize: 11.5, color: 'var(--color-fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {entry.detail}
                                </div>
                              )}
                              {entry.rawSnippet && (
                                <pre
                                  style={{
                                    fontSize: 10,
                                    color: 'var(--color-fg-subtle)',
                                    background: 'var(--color-pt-surface)',
                                    border: '1px solid var(--color-pt-border)',
                                    borderRadius: 6,
                                    padding: '6px 8px',
                                    maxHeight: 160,
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    margin: 0,
                                  }}
                                >
                                  {entry.rawSnippet}
                                </pre>
                              )}
                              {entry.keyReport && (
                                <div style={{ fontSize: 10.5, color: 'var(--color-fg-subtle)' }}>
                                  expected [{entry.keyReport.expected.join(', ') || '—'}] · returned [
                                  {entry.keyReport.returned.join(', ') || '—'}]
                                </div>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                                onClick={() => {
                                  void navigator.clipboard.writeText(JSON.stringify(entry, null, 2)).then(
                                    () => toast.success('Copied'),
                                    () => toast.error('Copy failed'),
                                  );
                                }}
                              >
                                <Copy size={11} strokeWidth={2} />
                                Copy entry
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

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

          {/* ── Request payload (JSON sent to /api/generate) ── */}
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
              onClick={() => setRequestPayloadOpen((v) => !v)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
                Request payload
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                {requestPayloadOpen ? '▲' : '▼'}
              </span>
            </button>
            {requestPayloadOpen && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {requestPayloadJson ? (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                      Exact JSON body POSTed to{' '}
                      <code style={{ fontSize: 10.5 }}>/api/generate</code> (the Worker forwards it
                      to Anthropic).
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                      onClick={() => {
                        void navigator.clipboard.writeText(requestPayloadJson).then(
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
                      {requestPayloadJson}
                    </pre>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Generate a note to see the request payload.
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

          {/* ── Section mapping (returned keys vs template keys) ── */}
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
              onClick={() => setKeyMapOpen((v) => !v)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
                Section mapping
              </span>
              {keyStatus && (
                <span style={{ fontSize: 11, fontWeight: 600, color: keyStatus.color }}>
                  {keyStatus.label}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                {keyMapOpen ? '▲' : '▼'}
              </span>
            </button>
            {keyMapOpen && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lastKeyReport ? (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                      Keys the AI returned vs. the keys this template expects. A blank note with a
                      non-empty response and zero matches means a template/response mismatch.
                    </div>
                    {(
                      [
                        { label: 'Expected (template)', keys: lastKeyReport.expected },
                        { label: 'Returned (AI)', keys: lastKeyReport.returned },
                        { label: 'Matched', keys: lastKeyReport.matched },
                        { label: 'Missing (expected, not returned)', keys: lastKeyReport.missing },
                        { label: 'Unexpected (returned, not in template)', keys: lastKeyReport.unexpected },
                        { label: 'Matched but empty', keys: lastKeyReport.emptyMatched },
                      ] as { label: string; keys: string[] }[]
                    ).map(({ label, keys }) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-fg-subtle)' }}>
                          {label}
                        </span>
                        <code style={{ fontSize: 10.5, color: 'var(--color-fg-subtle)', wordBreak: 'break-all' }}>
                          {keys.length > 0 ? keys.join(', ') : '—'}
                        </code>
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Generate a note to see the section mapping.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── PII scrub (last on-device redaction run) ── */}
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
              onClick={() => setPiiOpen((v) => !v)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', flex: 1 }}>
                PII scrub
              </span>
              {lastPiiScrub?.error ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-pt-danger, #c0392b)' }}>
                  Failed
                </span>
              ) : lastPiiScrub ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-fg-subtle)' }}>
                  {lastPiiScrub.entityTotal} flagged
                </span>
              ) : null}
              <span style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                {piiOpen ? '▲' : '▼'}
              </span>
            </button>
            {piiOpen && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lastPiiScrub ? (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--color-fg-subtle)' }}>
                      Last scrub in this session. Regex matches structured identifiers instantly;
                      the deep scan adds names/places via the on-device NER model.
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-fg)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--color-fg-subtle)' }}>Mode</span>
                        <span>{lastPiiScrub.mode === 'deep' ? 'Deep scan (regex + model)' : 'Regex only'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--color-fg-subtle)' }}>Regex matches</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{lastPiiScrub.regexCount}</span>
                      </div>
                      {lastPiiScrub.mode === 'deep' && (
                        <div className="flex items-center justify-between">
                          <span style={{ color: 'var(--color-fg-subtle)' }}>Model added</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{lastPiiScrub.modelAdded}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--color-fg-subtle)' }}>Total flagged</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{lastPiiScrub.entityTotal}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--color-fg-subtle)' }}>Model loaded</span>
                        <span>{lastPiiScrub.modelLoaded ? 'Yes' : 'No (first scan fetches it)'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span style={{ color: 'var(--color-fg-subtle)' }}>Model</span>
                        <code style={{ fontSize: 10.5, color: 'var(--color-fg-subtle)', wordBreak: 'break-all', textAlign: 'right' }}>
                          {lastPiiScrub.model}
                        </code>
                      </div>
                    </div>
                    {lastPiiScrub.error && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-pt-danger, #c0392b)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {lastPiiScrub.error}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-fg-subtle)' }}>
                    Open Scrub PII on a transcript to see the redaction breakdown.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Session audio + transcripts (active session only) ── */}
          {activeSession && (
            <>
              <SessionAudioPanel session={activeSession} />
              <TranscriptPanel session={activeSession} />
            </>
          )}

          {/* ── Environment diagnostics (global, work off-session) ── */}
          <EnvironmentPanel />
          <StoragePanel />
          <FeaturesPanel />
        </div>
      </motion.div>
    </div>
  );
}
