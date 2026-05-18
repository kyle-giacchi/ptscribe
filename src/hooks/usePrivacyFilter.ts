import { useCallback, useState } from 'react';
import { scrubPII } from '@/services/ai/client/privacyFilter';

export interface ScrubResult {
  scrubbed: string;
  entityCount: number;
}

export function usePrivacyFilter() {
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<string | null>(null);

  const scrub = useCallback(async (text: string): Promise<ScrubResult> => {
    setScrubbing(true);
    setScrubProgress(null);
    try {
      return await scrubPII(text, (msg) => setScrubProgress(msg));
    } finally {
      setScrubbing(false);
      setScrubProgress(null);
    }
  }, []);

  return { scrubbing, scrubProgress, scrub };
}
