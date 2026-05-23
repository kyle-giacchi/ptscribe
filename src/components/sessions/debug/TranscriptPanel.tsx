import { useState } from 'react';
import { Check, Copy, Cpu, Mic, Pencil, Sparkles } from 'lucide-react';
import type { Session } from '@/types';
import { wordCount } from '@/lib/debug/env';
import { CollapsibleSection, useCopy } from './atoms';

/**
 * Session-scoped transcript-tier inspector for the Debug Menu, migrated from
 * the Admin page. Tabs across the four transcript tiers (T1 live, T2 post,
 * T3 Nova, edited) plus a per-clip breakdown so a clinician's reported "the
 * note is wrong" can be traced to the exact tier feeding generation.
 */

const TRANSCRIPT_TABS = [
  { key: 't1' as const, label: 'T1 Live Whisper', color: '#6366f1', Icon: Mic },
  { key: 't2' as const, label: 'T2 Post Whisper', color: '#0ea5e9', Icon: Cpu },
  { key: 't3' as const, label: 'T3 Nova AI', color: '#10b981', Icon: Sparkles },
  { key: 'edited' as const, label: 'Edited', color: '#f59e0b', Icon: Pencil },
];

type TranscriptKey = (typeof TRANSCRIPT_TABS)[number]['key'];

function TranscriptTabs({ session }: { session: Session }) {
  const { copied, copy } = useCopy();
  const texts: Record<TranscriptKey, string | undefined> = {
    t1: session.t1Transcript,
    t2: session.t2Transcript,
    t3: session.t3Transcript,
    edited: session.editedTranscript,
  };

  const available = TRANSCRIPT_TABS.filter((t) => texts[t.key]);
  const [activeKey, setActiveKey] = useState<TranscriptKey>(available[0]?.key ?? 't1');

  if (available.length === 0) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
        No session-level transcripts yet.
      </span>
    );
  }

  const active = TRANSCRIPT_TABS.find((t) => t.key === activeKey);
  const text = texts[activeKey];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TRANSCRIPT_TABS.map((tab) => {
          const hasText = Boolean(texts[tab.key]);
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={!hasText}
              onClick={() => setActiveKey(tab.key)}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors"
              style={{
                fontSize: 11,
                fontWeight: 600,
                cursor: hasText ? 'pointer' : 'default',
                opacity: hasText ? 1 : 0.38,
                background: isActive
                  ? `color-mix(in oklab, ${tab.color} 12%, transparent)`
                  : 'var(--color-pt-surface-mut)',
                color: isActive ? tab.color : 'var(--color-pt-text-2)',
                border: `1px solid ${
                  isActive ? `color-mix(in oklab, ${tab.color} 30%, transparent)` : 'transparent'
                }`,
              }}
            >
              <tab.Icon size={10} strokeWidth={2} />
              {tab.label}
              {hasText && (
                <span
                  className="rounded-full px-1.5"
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    background: isActive
                      ? `color-mix(in oklab, ${tab.color} 18%, transparent)`
                      : 'var(--color-pt-surface-alt)',
                    color: isActive ? tab.color : 'var(--color-pt-text-3)',
                  }}
                >
                  {wordCount(texts[tab.key])}w
                </span>
              )}
            </button>
          );
        })}
      </div>

      {session.clips.length > 0 && (
        <details className="mb-3">
          <summary
            style={{
              fontSize: 10.5,
              color: 'var(--color-pt-text-3)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Per-clip breakdown ({session.clips.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {session.clips.map((clip) => (
              <div
                key={clip.id}
                className="flex items-center gap-2 rounded-md px-3 py-2"
                style={{ background: 'var(--color-pt-surface-mut)', fontSize: 11 }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-pt-text)', flexShrink: 0 }}>
                  Clip {clip.index + 1}
                </span>
                <span style={{ color: 'var(--color-pt-text-3)', flexShrink: 0 }}>
                  {Math.round(clip.durationSec)}s
                </span>
                <div className="ml-auto flex items-center gap-3">
                  {clip.t1Transcript ? (
                    <span style={{ color: '#6366f1' }}>T1 · {wordCount(clip.t1Transcript)}w</span>
                  ) : (
                    <span style={{ color: 'var(--color-pt-text-3)', opacity: 0.5 }}>T1 —</span>
                  )}
                  {clip.t2Transcript ? (
                    <span style={{ color: '#0ea5e9' }}>T2 · {wordCount(clip.t2Transcript)}w</span>
                  ) : (
                    <span style={{ color: 'var(--color-pt-text-3)', opacity: 0.5 }}>T2 —</span>
                  )}
                  {clip.t3Transcript ? (
                    <span style={{ color: '#10b981' }}>T3 · {wordCount(clip.t3Transcript)}w</span>
                  ) : (
                    <span style={{ color: 'var(--color-pt-text-3)', opacity: 0.5 }}>T3 —</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {text && active && (
        <div
          className="rounded-lg p-3"
          style={{
            background: `color-mix(in oklab, ${active.color} 5%, transparent)`,
            borderLeft: `3px solid ${active.color}`,
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: active.color,
              }}
            >
              {active.label} · {wordCount(text)} words
            </div>
            <button
              type="button"
              onClick={() => copy(text, activeKey)}
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: copied === activeKey ? '#10b981' : active.color,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              {copied === activeKey ? (
                <>
                  <Check size={10} strokeWidth={2.5} /> Copied
                </>
              ) : (
                <>
                  <Copy size={10} strokeWidth={1.75} /> Copy
                </>
              )}
            </button>
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.65,
              color: 'var(--color-pt-text)',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

export function TranscriptPanel({ session }: { session: Session }) {
  const availableCount = [
    session.t1Transcript,
    session.t2Transcript,
    session.t3Transcript,
    session.editedTranscript,
  ].filter(Boolean).length;

  const badge =
    availableCount > 0 ? (
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 999,
          background: 'color-mix(in oklab, var(--color-pt-accent) 12%, transparent)',
          color: 'var(--color-pt-accent-fg)',
        }}
      >
        {availableCount} tier{availableCount !== 1 ? 's' : ''}
      </span>
    ) : (
      <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)' }}>none</span>
    );

  return (
    <CollapsibleSection title="Transcriptions" badge={badge}>
      <TranscriptTabs session={session} />
    </CollapsibleSection>
  );
}
