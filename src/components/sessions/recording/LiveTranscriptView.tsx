import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, ChevronDown } from 'lucide-react';
import type { TranscriptSegment } from '@/hooks/useLiveTranscript';

// ── Live transcript helpers ───────────────────────────────────────────────────

function fmtWallTime(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const min = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2, '0')}${ampm}`;
}

function ChatBubble({
  children,
  timestamp,
  isInterim = false,
}: {
  children: React.ReactNode;
  timestamp?: string;
  isInterim?: boolean;
}) {
  return (
    <div className="flex items-end gap-2">
      {/* Avatar */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isInterim ? 'var(--color-pt-surface-alt)' : 'var(--color-pt-accent)',
          border: '1px solid var(--color-pt-border)',
          opacity: isInterim ? 0.5 : 1,
        }}
      >
        <Mic size={11} style={{ color: isInterim ? 'var(--color-pt-text-3)' : 'white' }} />
      </div>
      {/* Bubble — rounded-bl-sm creates the tail toward the avatar */}
      <div
        className="max-w-[82%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
        style={{
          background: 'var(--color-pt-surface-alt)',
          border: '1px solid var(--color-pt-border)',
          opacity: isInterim ? 0.65 : 1,
        }}
      >
        {children}
        {timestamp && (
          <span
            className="mt-1 block text-right text-[10px] tabular-nums"
            style={{ color: 'var(--color-pt-text-3)' }}
          >
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ animation: 'transcript-slide-in 280ms ease-out both' }}>
      <ChatBubble isInterim>
        <div className="flex items-center gap-1 py-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full"
              style={{
                background: 'var(--color-pt-text-3)',
                animationDelay: `${i * 160}ms`,
                animationDuration: '900ms',
              }}
            />
          ))}
        </div>
      </ChatBubble>
    </div>
  );
}

export function LiveTranscriptView({
  segments,
  interimText,
  whisperBubbles = [],
  expandToFill = false,
  isActive = false,
}: {
  segments: TranscriptSegment[];
  interimText: string;
  whisperBubbles?: string[];
  expandToFill?: boolean;
  isActive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const hasWebSpeech = segments.length > 0 || !!interimText;
  const hasContent = hasWebSpeech || whisperBubbles.length > 0;
  // The hint reveals once the user has been silent for ≥ 8 s. We track the
  // timer-fired flag separately from `hasContent` so the visible hint is a
  // derived value (`hintTimerFired && !hasContent`) — no sync setState in
  // effect needed to clear it when speech arrives.
  const [hintTimerFired, setHintTimerFired] = useState(false);
  useEffect(() => {
    if (hasContent) return;
    const t = window.setTimeout(() => setHintTimerFired(true), 8000);
    return () => window.clearTimeout(t);
  }, [hasContent]);
  const showNoSpeechHint = hintTimerFired && !hasContent;

  // Auto-scroll only when user is already at the bottom
  useEffect(() => {
    const el = containerRef.current;
    if (el && isAtBottom) el.scrollTop = el.scrollHeight;
  }, [segments.length, interimText, whisperBubbles.length, isAtBottom]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distFromBottom < 48);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setIsAtBottom(true);
    }
  }, []);

  return (
    <div
      className={`relative w-full${expandToFill ? 'min-h-0 flex-1' : ''}`}
      style={expandToFill ? {} : { maxHeight: 300 }}
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`flex w-full overflow-y-auto rounded-xl flex-col${expandToFill ? 'h-full' : 'max-h-full'}`}
        style={{
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
        }}
      >
        {!hasContent ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full"
                    style={{ background: 'var(--color-pt-text-3)', animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </div>
              <p className="text-xs italic" style={{ color: 'var(--color-pt-text-3)' }}>
                Transcribing&hellip;
              </p>
            </div>
            {showNoSpeechHint && (
              <p
                className="text-center text-xs leading-relaxed"
                style={{ color: 'var(--color-pt-text-3)' }}
              >
                Transcription starts after the first audio chunk (~5 s).
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Spacer pushes bubbles to the bottom when content is short */}
            <div className="min-h-3 flex-1" />
            <div className="flex flex-col gap-3 px-3 py-3">
              {hasWebSpeech ? (
                <>
                  {segments.map((seg) => (
                    <div
                      key={seg.wallTime}
                      style={{ animation: 'transcript-slide-in 280ms ease-out both' }}
                    >
                      <ChatBubble timestamp={fmtWallTime(seg.wallTime)}>
                        <p
                          className="text-sm leading-relaxed"
                          style={{ color: 'var(--color-pt-text)' }}
                        >
                          {seg.text.trim()}
                        </p>
                      </ChatBubble>
                    </div>
                  ))}
                  {interimText && (
                    <div style={{ animation: 'transcript-slide-in 280ms ease-out both' }}>
                      <ChatBubble isInterim>
                        <p
                          className="text-sm leading-relaxed italic"
                          style={{ color: 'var(--color-pt-text-3)' }}
                        >
                          {interimText}
                          <span
                            className="ml-0.5 inline-block w-px align-middle"
                            style={{
                              height: '1em',
                              background: 'var(--color-pt-accent)',
                              animation: 'transcript-cursor-blink 900ms step-end infinite',
                            }}
                          />
                        </p>
                      </ChatBubble>
                    </div>
                  )}
                </>
              ) : (
                whisperBubbles.map((text, i) => {
                  const isLast = i === whisperBubbles.length - 1;
                  return (
                    <div key={i} style={{ animation: 'transcript-slide-in 280ms ease-out both' }}>
                      <ChatBubble>
                        <p
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ color: 'var(--color-pt-text)' }}
                        >
                          {text}
                          {isLast && (
                            <span
                              className="ml-0.5 inline-block w-px align-middle"
                              style={{
                                height: '1em',
                                background: 'var(--color-pt-accent)',
                                animation: 'transcript-cursor-blink 900ms step-end infinite',
                              }}
                            />
                          )}
                        </p>
                      </ChatBubble>
                    </div>
                  );
                })
              )}
              {isActive && !interimText && <TypingIndicator />}
            </div>
          </>
        )}
      </div>

      {/* Scroll-to-bottom button — visible when user has scrolled up */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          className="absolute right-3 bottom-3 flex items-center justify-center rounded-full shadow-lg transition-opacity hover:opacity-90"
          style={{
            width: 32,
            height: 32,
            background: 'var(--color-pt-accent)',
            color: 'white',
            animation: 'transcript-slide-in 180ms ease-out both',
            zIndex: 1,
          }}
        >
          <ChevronDown size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
