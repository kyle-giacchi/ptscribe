import { useState } from 'react';
import { toast } from 'sonner';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { PtButton } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';
import {
  testConnection,
  validateEndpointUrl,
  normalizeBaseUrl,
} from '@/services/ai/client/openaiCompat';
import { friendlyAiError } from '@/services/ai/errors';
import type { SelfHostedEndpoint, SelfHostedProvider } from '@/types';

interface Props {
  provider: SelfHostedProvider;
}

const COPY: Record<SelfHostedProvider, { urlHint: string; placeholder: string }> = {
  local: {
    urlHint: 'A server running on this machine, e.g. Ollama or LM Studio.',
    placeholder: 'http://localhost:11434',
  },
  network: {
    urlHint: 'A server your clinic controls, reachable from this device over HTTPS.',
    placeholder: 'https://llm.clinic.internal',
  },
};

/**
 * Endpoint config for a self-hosted OpenAI-compatible model. The transcript is
 * sent from this browser straight to the URL below — it never reaches our
 * servers (ADR-0011), which is exactly why the URL is a consent moment.
 */
export function SelfHostedEndpointCard({ provider }: Props) {
  const { settings, updateAi } = useSettings();
  const generation = settings.ai.generation;
  const saved: SelfHostedEndpoint | undefined = generation.endpoints?.[provider];

  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '');
  const [models, setModels] = useState<string[]>(saved?.model ? [saved.model] : []);
  const [testing, setTesting] = useState(false);

  const urlError = baseUrl.trim() ? validateEndpointUrl(baseUrl) : null;

  function persist(next: SelfHostedEndpoint) {
    updateAi({
      generation: {
        ...generation,
        model: next.model,
        endpoints: { ...generation.endpoints, [provider]: next },
      },
    });
  }

  async function runTest() {
    const invalid = validateEndpointUrl(baseUrl);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setTesting(true);
    try {
      const result = await testConnection(provider, {
        baseUrl,
        model: saved?.model ?? '',
        apiKey: apiKey || undefined,
      });
      if (!result.ok) {
        const friendly = result.error ? friendlyAiError(result.error) : null;
        toast.error(friendly?.title ?? 'Connection failed', {
          description: friendly?.description,
        });
        return;
      }
      setModels(result.models);
      toast.success(
        result.models.length
          ? `Connected — ${result.models.length} model${result.models.length === 1 ? '' : 's'} available`
          : 'Connected, but the server listed no models',
      );
    } finally {
      setTesting(false);
    }
  }

  function save(model: string) {
    const invalid = validateEndpointUrl(baseUrl);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    // Changing where a *network* endpoint points changes who receives PHI.
    // Loopback stays on this machine, so it needs no warning.
    const normalized = normalizeBaseUrl(baseUrl);
    if (provider === 'network' && normalized !== normalizeBaseUrl(saved?.baseUrl ?? '')) {
      const ok = window.confirm(
        `Notes generated in-network will be sent to ${normalized}. Only use a server your clinic controls.`,
      );
      if (!ok) return;
    }
    persist({ baseUrl: normalized, model, apiKey: apiKey || undefined });
    toast.success('Endpoint saved');
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label="Server URL" hint={COPY[provider].urlHint}>
        <TextInput
          placeholder={COPY[provider].placeholder}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </Field>
      {urlError ? (
        <div style={{ fontSize: 12.5, color: 'var(--color-pt-danger)', lineHeight: 1.5 }}>
          {urlError}
        </div>
      ) : null}

      <Field label="Access token" hint="Optional — only if your server requires one.">
        <TextInput
          type="password"
          placeholder="Leave blank for none"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </Field>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <PtButton variant="ghost" onClick={() => void runTest()} disabled={testing || !baseUrl}>
          {testing ? 'Testing…' : 'Test connection'}
        </PtButton>
        {saved ? (
          <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
            Saved: {saved.model} @ {saved.baseUrl}
          </span>
        ) : null}
      </div>

      {models.length > 0 && (
        <Field
          label="Model"
          hint="An 8B model or larger produces usable notes; smaller ones drift."
        >
          <Select value={saved?.model ?? ''} onChange={(e) => save(e.target.value)}>
            <option value="" disabled>
              Pick a model…
            </option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <details style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)', lineHeight: 1.6 }}>
        <summary style={{ cursor: 'pointer' }}>Setting up your server</summary>
        <ul style={{ marginTop: 8, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>
            <strong>Allow this site.</strong> Servers reject cross-origin browser requests by
            default. For Ollama, start it with <code>OLLAMA_ORIGINS={window.location.origin}</code>.
          </li>
          {provider === 'network' ? (
            <>
              <li>
                <strong>HTTPS is required.</strong> This page is served over HTTPS, and browsers
                block plain-<code>http://</code> requests to anything but localhost. Put the server
                behind a reverse proxy with a certificate (Caddy&apos;s <code>tls internal</code>,
                Tailscale, or mkcert).
              </li>
              <li>
                <strong>Private-network access.</strong> Chrome sends a preflight before an HTTPS
                page may call a private IP; the server must answer{' '}
                <code>Access-Control-Allow-Private-Network: true</code>.
              </li>
            </>
          ) : (
            <li>
              <strong>Loopback is exempt.</strong> <code>http://localhost</code> works from this
              HTTPS page without a certificate — a LAN IP does not.
            </li>
          )}
        </ul>
      </details>
    </div>
  );
}
