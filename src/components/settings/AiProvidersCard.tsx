import { useEffect, useState } from 'react';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard, SegmentedControl } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { useSettings } from '@/contexts/SettingsProvider';
import { useProviderCatalog, defaultModelFor } from '@/services/ai/providerCatalog';
import { getUserKeys, type KeyProvider, type KeyStatus } from '@/services/ai/keysClient';
import { useUsableKey } from '@/hooks/useUsableKey';
import { ProviderKeyCard } from './ProviderKeyCard';
import type { GenerationProvider } from '@/types';

const GEN_PROVIDERS: GenerationProvider[] = ['anthropic', 'openai', 'google', 'none'];
const GEN_LABELS: Record<GenerationProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  none: 'Off',
};

export function AiProvidersCard() {
  const { settings, updateAi } = useSettings();
  const genProvider = settings.ai.generation.provider;
  // Org-key signal: surfaces "provided by your organization" so a member knows
  // why Generate works without their own key (issue 09).
  const { orgSet } = useUsableKey();

  // Masked key status per provider (server-side, write-only). `null` = still
  // loading; `signinRequired` = not authenticated, so BYOK key management is hidden.
  const [keys, setKeys] = useState<Record<string, KeyStatus> | null>(null);
  const [signinRequired, setSigninRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getUserKeys().then((result) => {
      if (cancelled) return;
      if (result.signinRequired) {
        setSigninRequired(true);
        setKeys({});
        return;
      }
      setSigninRequired(false);
      setKeys(Object.fromEntries(result.keys.map((k) => [k.provider, k])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function changeGenProvider(next: GenerationProvider) {
    if (next === 'none') {
      updateAi({ generation: { ...settings.ai.generation, provider: 'none' } });
      return;
    }
    // Switching provider keeps each provider's stored key (server-side, untouched);
    // only re-point the active model to the new provider's default.
    updateAi({ generation: { provider: next, model: defaultModelFor(next) } });
  }

  function handleKeyStatus(provider: KeyProvider, status: KeyStatus) {
    setKeys((prev) => ({ ...(prev ?? {}), [provider]: status }));
  }

  const catalog = useProviderCatalog();
  const activeDescriptor = genProvider !== 'none' ? catalog[genProvider] : null;

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>AI providers</Eyebrow>
        <HipaaDisclosure variant="compact" />

        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <Field label="Transcription provider">
            <Select
              value={settings.ai.transcription.provider}
              onChange={(e) =>
                updateAi({
                  transcription: {
                    ...settings.ai.transcription,
                    provider: e.target.value as typeof settings.ai.transcription.provider,
                  },
                })
              }
            >
              <option value="cloudflare">Cloudflare Workers AI (Nova-3 with diarization)</option>
              <option value="local">
                Local Whisper (no API credits, first use downloads ~150 MB)
              </option>
              <option value="webspeech">Browser live (Web Speech, no speaker labels)</option>
              <option value="none">Off</option>
            </Select>
          </Field>
          {settings.ai.transcription.provider === 'cloudflare' && (
            <Field label="Transcription model" hint="Cloudflare model ID">
              <TextInput
                placeholder="@cf/deepgram/nova-3"
                value={settings.ai.transcription.model}
                onChange={(e) =>
                  updateAi({
                    transcription: { ...settings.ai.transcription, model: e.target.value },
                  })
                }
              />
            </Field>
          )}
          {settings.ai.transcription.provider === 'local' && (
            <Field
              label="Local model"
              hint="HuggingFace model ID — tiny.en is fastest, base.en is more accurate"
            >
              <TextInput
                placeholder="onnx-community/whisper-tiny.en"
                value={settings.ai.transcription.model}
                onChange={(e) =>
                  updateAi({
                    transcription: { ...settings.ai.transcription, model: e.target.value },
                  })
                }
              />
            </Field>
          )}
        </div>

        {/* ── Note generation (BYOK) ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Generation provider">
            <div>
              <SegmentedControl<GenerationProvider>
                value={genProvider}
                onChange={changeGenProvider}
                items={GEN_PROVIDERS.map((p) => ({ value: p, label: GEN_LABELS[p] }))}
              />
            </div>
          </Field>

          {genProvider === 'none' ? (
            <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
              AI note generation is off — you can still write and edit notes manually.
            </div>
          ) : (
            <>
              <Field label="Model" className="max-w-sm">
                <Select
                  value={settings.ai.generation.model}
                  onChange={(e) =>
                    updateAi({
                      generation: { ...settings.ai.generation, model: e.target.value },
                    })
                  }
                >
                  {catalog[genProvider].models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {signinRequired ? (
                <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
                  Sign in to add your own {activeDescriptor?.label} API key. With your key, note
                  generation runs against your provider account.
                </div>
              ) : keys === null ? (
                <div style={{ fontSize: 12.5, color: 'var(--color-pt-text-3)' }}>
                  Loading key status…
                </div>
              ) : activeDescriptor ? (
                <>
                  <ProviderKeyCard
                    descriptor={activeDescriptor}
                    status={keys[activeDescriptor.id]}
                    onStatusChange={(s) => handleKeyStatus(activeDescriptor.id, s)}
                  />
                  {orgSet ? (
                    <div style={{ fontSize: 12, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}>
                      Your organization provides a {activeDescriptor.label} key. It’s used when you
                      haven’t set your own — your personal key takes priority.
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
