import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, X } from 'lucide-react';
import { useUsableKey } from '@/hooks/useUsableKey';
import { PROVIDER_CATALOG } from '@/services/ai/providerCatalog';

/**
 * Dismissible reminder shown when the active generation provider has no usable
 * key (personal or org) — issue 07. Capture/curate/manual notes still work; only
 * AI generation is blocked, so this nudges rather than interrupts. Dismissal is
 * per browser session and per provider (sessionStorage), so switching providers
 * or reopening the tab re-surfaces it. Never shown in demo / when provider = none
 * (useUsableKey returns `disabled`).
 */
export function KeyReminderBanner() {
  const { state, provider } = useUsableKey();
  const navigate = useNavigate();
  const dismissKey = provider ? `ptscribe-key-reminder-dismissed:${provider}` : '';
  const [dismissed, setDismissed] = useState<boolean>(() =>
    dismissKey ? sessionStorage.getItem(dismissKey) === '1' : false,
  );

  if (state !== 'missing' || !provider || dismissed) return null;

  const label = PROVIDER_CATALOG[provider].label;

  function dismiss() {
    if (dismissKey) sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--color-pt-amber-soft, #fff7ed)',
        borderBottom: '1px solid var(--color-pt-amber-border, #fed7aa)',
        padding: '7px 22px',
        fontSize: 12.5,
        color: 'var(--color-pt-amber-fg, #9a3412)',
        lineHeight: 1.4,
      }}
    >
      <KeyRound size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        Add your {label} API key to generate notes. Recording and manual notes work without it.
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: 28, padding: '3px 10px', fontSize: 12 }}
        onClick={() => navigate('/settings')}
      >
        Add key
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          display: 'flex',
          padding: 2,
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
