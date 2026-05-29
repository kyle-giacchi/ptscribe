import { useCallback, useState } from 'react';
import {
  scrubPII,
  isPIIModelLoaded,
  PRIVACY_FILTER_MODEL,
} from '@/services/ai/client/privacyFilter';
import { detectRegexPII } from '@/lib/pii/regexPII';
import { applySpans, mergeSpans, type PIISpan } from '@/lib/pii/scrubSpans';
import { useSettings } from '@/contexts/SettingsProvider';

export interface ScrubResult {
  scrubbed: string;
  entityCount: number;
  spans: PIISpan[];
}

export function usePrivacyFilter() {
  const { settings } = useSettings();
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<string | null>(null);

  /** Instant, synchronous regex pass — no model, no network. */
  const scrubRegex = useCallback((text: string): ScrubResult => {
    const spans = detectRegexPII(text);
    return { ...applySpans(text, spans), spans };
  }, []);

  /**
   * Deep scan with the on-device NER model. Merges its spans on top of the
   * regex spans (passed in) so the structured hits are never lost.
   */
  const scrubModel = useCallback(
    async (text: string, regexSpans: PIISpan[] = []): Promise<ScrubResult> => {
      const model = settings.session.piiModel ?? PRIVACY_FILTER_MODEL;
      setScrubbing(true);
      setScrubProgress(isPIIModelLoaded() ? null : 'Loading model…');
      try {
        const { spans: modelSpans } = await scrubPII(text, (msg) => setScrubProgress(msg), model);
        const merged = mergeSpans(regexSpans, modelSpans);
        return { ...applySpans(text, merged), spans: merged };
      } finally {
        setScrubbing(false);
        setScrubProgress(null);
      }
    },
    [settings.session.piiModel],
  );

  return { scrubbing, scrubProgress, scrubRegex, scrubModel };
}
