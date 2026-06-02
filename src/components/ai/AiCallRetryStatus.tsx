import { Loader2 } from 'lucide-react';

interface Props {
  provider: 'anthropic' | 'nova' | 'openai' | 'google';
  attempt: number;
  max: number;
}

const NAMES: Record<Props['provider'], string> = {
  anthropic: 'Anthropic',
  nova: 'Cloudflare Nova',
  openai: 'OpenAI',
  google: 'Google',
};

export function AiCallRetryStatus({ provider, attempt, max }: Props) {
  return (
    <div
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--color-pt-text-2)',
      }}
    >
      <Loader2 size={12} strokeWidth={2} className="animate-spin" aria-hidden="true" />
      <span>
        {NAMES[provider]} slow — retrying (attempt {attempt + 1} of {max + 1})…
      </span>
    </div>
  );
}
