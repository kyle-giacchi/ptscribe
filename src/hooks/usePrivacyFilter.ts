import { useCallback, useState } from 'react';
import { scrubPII, isPIIModelLoaded, PRIVACY_FILTER_MODEL } from '@/services/ai/client/privacyFilter';
import { useSettings } from '@/contexts/SettingsProvider';

export interface ScrubResult {
  scrubbed: string;
  entityCount: number;
}

export function usePrivacyFilter() {
  const { settings } = useSettings();
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<string | null>(null);

  const scrub = useCallback(async (text: string): Promise<ScrubResult> => {
    const model = settings.session.piiModel ?? PRIVACY_FILTER_MODEL;
    setScrubbing(true);
    setScrubProgress(isPIIModelLoaded() ? null : 'Loading model…');
    try {
      return await scrubPII(text, (msg) => setScrubProgress(msg), model);
    } finally {
      setScrubbing(false);
      setScrubProgress(null);
    }
  }, [settings.session.piiModel]);

  return { scrubbing, scrubProgress, scrub };
}
