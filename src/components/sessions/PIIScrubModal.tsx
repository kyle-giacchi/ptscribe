import { useMemo, useState } from 'react';
import { Loader2, EyeOff, AlertCircle, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { usePrivacyFilter, type ScrubResult } from '@/hooks/usePrivacyFilter';

interface Props {
  open: boolean;
  transcript: string;
  onApply: (scrubbed: string) => void;
  onClose: () => void;
}

type ScanState = 'ready' | 'scanning' | 'error';

type DiffPart =
  | { type: 'same'; text: string }
  | { type: 'removed'; text: string }
  | { type: 'added'; text: string };

function computeWordDiff(original: string, scrubbed: string): DiffPart[] {
  // Tokenise preserving whitespace so the diff re-joins cleanly
  const origTokens = original.split(/(\s+)/);
  const scrubbedTokens = scrubbed.split(/(\s+)/);
  const n = origTokens.length;
  const m = scrubbedTokens.length;

  // LCS DP table (n*m is fine for PT-note lengths)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        origTokens[i - 1] === scrubbedTokens[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build the diff sequence
  const raw: DiffPart[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === scrubbedTokens[j - 1]) {
      raw.unshift({ type: 'same', text: origTokens[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'added', text: scrubbedTokens[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'removed', text: origTokens[i - 1] });
      i--;
    }
  }

  // Collapse consecutive same-type parts for cleaner rendering
  const parts: DiffPart[] = [];
  for (const part of raw) {
    const last = parts[parts.length - 1];
    if (last && last.type === part.type) last.text += part.text;
    else parts.push({ ...part });
  }
  return parts;
}

export function PIIScrubModal({ open, transcript, onApply, onClose }: Props) {
  const { scrubProgress, scrubbing, scrubRegex, scrubModel } = usePrivacyFilter();
  const [scanState, setScanState] = useState<ScanState>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Deep-scan (NER) result, when the user opts in. Null until then.
  const [deepResult, setDeepResult] = useState<ScrubResult | null>(null);

  const hasText = transcript.trim().length > 0;

  // Instant regex pass — pure + synchronous, so derive it during render.
  const regexResult = useMemo<ScrubResult>(
    () => (hasText ? scrubRegex(transcript) : { scrubbed: transcript, entityCount: 0, spans: [] }),
    [hasText, transcript, scrubRegex],
  );

  const deepScanned = deepResult !== null;
  const active = deepResult ?? regexResult;
  const { entityCount, scrubbed: scrubbedText } = active;

  const diffParts = useMemo<DiffPart[]>(
    () => computeWordDiff(transcript, scrubbedText),
    [transcript, scrubbedText],
  );

  function resetAndClose() {
    setScanState('ready');
    setErrorMsg(null);
    setDeepResult(null);
    onClose();
  }

  async function handleDeepScan() {
    setScanState('scanning');
    setErrorMsg(null);
    try {
      const result = await scrubModel(transcript, regexResult.spans);
      setDeepResult(result);
      setScanState('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PII scan failed — try again');
      setScanState('error');
    }
  }

  function handleApply() {
    onApply(scrubbedText);
    resetAndClose();
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Scrub PII" size="xl">
      <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
        Structured identifiers (email, phone, SSN, MRN) are matched instantly on-device.
        Run a deep scan to also catch names and places with the local AI model.
        Review the diff before applying — the scrubbed version replaces your edited transcript.
      </p>

      {/* Diff / preview area */}
      <div
        className="overflow-y-auto rounded-lg border"
        style={{
          maxHeight: 340,
          padding: '12px 16px',
          borderColor: 'var(--color-pt-border)',
          background: 'var(--color-pt-surface-alt)',
          fontSize: 12,
          lineHeight: '1.8',
          fontFamily: 'ui-monospace, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {!hasText && (
          <span style={{ color: 'var(--color-fg-subtle)' }}>
            <em>No transcript to scan.</em>
          </span>
        )}

        {scanState === 'scanning' && (
          <span className="flex items-center gap-2" style={{ color: 'var(--color-fg-muted)', fontFamily: 'inherit' }}>
            <Loader2 size={13} className="animate-spin shrink-0" />
            {scrubProgress ?? 'Scanning…'}
          </span>
        )}

        {hasText && scanState === 'ready' && (
          <>
            {diffParts.map((part, idx) => {
              if (part.type === 'same') return <span key={idx}>{part.text}</span>;
              if (part.type === 'removed') {
                return (
                  <del
                    key={idx}
                    style={{
                      color: 'var(--color-error, #dc2626)',
                      textDecoration: 'line-through',
                      background: 'color-mix(in oklab, #dc2626 10%, transparent)',
                      borderRadius: 2,
                    }}
                  >
                    {part.text}
                  </del>
                );
              }
              return (
                <ins
                  key={idx}
                  style={{
                    color: 'var(--color-success, #16a34a)',
                    textDecoration: 'none',
                    background: 'color-mix(in oklab, #16a34a 12%, transparent)',
                    borderRadius: 2,
                    padding: '0 1px',
                  }}
                >
                  {part.text}
                </ins>
              );
            })}
          </>
        )}

        {scanState === 'error' && (
          <span className="flex items-start gap-2" style={{ color: 'var(--color-error, #dc2626)', fontFamily: 'inherit' }}>
            <AlertCircle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
            {errorMsg}
          </span>
        )}
      </div>

      {/* Entity count summary */}
      {hasText && scanState === 'ready' && (
        <p className="text-sm" style={{ color: entityCount === 0 ? 'var(--color-fg-muted)' : 'var(--color-pt-accent)' }}>
          {entityCount === 0
            ? deepScanned
              ? 'No PII detected — transcript looks clean.'
              : 'No structured PII found. Run a deep scan to check for names and places.'
            : `${entityCount} item${entityCount !== 1 ? 's' : ''} flagged for redaction${deepScanned ? '' : ' (deep scan can find more)'}.`}
        </p>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn btn-ghost" onClick={resetAndClose}>
          {scanState === 'ready' && entityCount === 0 && deepScanned ? 'Close' : 'Cancel'}
        </button>

        <div className="flex items-center gap-2">
          {(scanState === 'ready' || scanState === 'error') && !deepScanned && hasText && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDeepScan}
              disabled={scrubbing || !transcript.trim()}
            >
              <Sparkles size={13} strokeWidth={2} />
              {scanState === 'error' ? 'Retry deep scan' : 'Deep scan with AI'}
            </button>
          )}

          {scanState === 'ready' && entityCount > 0 && (
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--color-pt-accent)', color: '#fff', border: 'none' }}
              onClick={handleApply}
            >
              <EyeOff size={13} strokeWidth={2} />
              Apply {entityCount} redaction{entityCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
