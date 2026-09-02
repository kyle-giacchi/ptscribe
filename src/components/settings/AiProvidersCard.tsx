import { useEffect, useState } from 'react';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard, SegmentedControl } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { useSettings } from '@/contexts/SettingsProvider';
import { useProviderCatalog, defaultModelFor } from '@/services/ai/providerCatalog';
import { getUserKeys, type KeyProvider, type KeyStatus } from '@/services/ai/keysClient';
import { useUsableKey } from '@/hooks/useUsableKey';
import { ProviderKeyCard } from './ProviderKeyCard';
import { SelfHostedEndpointCard } from './SelfHostedEndpointCard';
import { useSelfHostedAllowed } from '@/hooks/useSelfHostedAllowed';
import {
  isCloudProvider,
  isSelfHostedProvider,
  type CloudGenerationProvider,
  type GenerationProvider,
} from '@/types';

const CLOUD_SEGMENTS: CloudGenerationProvider[] = ['anthropic', 'openai', 'google'];
const SELF_HOSTED_SEGMENTS: GenerationProvider[] = ['local', 'network'];
const GEN_LABELS: Record<GenerationProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  local: 'This machine',
  network: 'In-network',
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
    const current = settings.ai.generation;
    if (next === 'none') {
      updateAi({ generation: { ...current, provider: 'none' } });
      return;
    }
    if (isSelfHostedProvider(next)) {
      // Remember the cloud provider being routed around — it's the only one the
      // failure dialog may offer, and only with the user's explicit consent.
      updateAi({
        generation: {
          ...current,
          provider: next,
          model: current.endpoints?.[next]?.model ?? '',
          cloudFallback: isCloudProvider(current.provider)
            ? current.provider
            : current.cloudFallback,
        },
      });
      return;
    }
    // Switching provider keeps each provider's stored key (server-side, untouched);
    // only re-point the active model to the new provider's default.
    updateAi({ generation: { ...current, provider: next, model: defaultModelFor(next) } });
  }

  function handleKeyStatus(provider: KeyProvider, status: KeyStatus) {
    setKeys((prev) => ({ ...(prev ?? {}), [provider]: status }));
  }

  const catalog = useProviderCatalog();
  const activeDescriptor = isCloudProvider(genProvider) ? catalog[genProvider] : null;
  const selfHostedAllowed = useSelfHostedAllowed();
  const segments: GenerationProvider[] = [
    ...CLOUD_SEGMENTS,
    ...(selfHostedAllowed ? SELF_HOSTED_SEGMENTS : []),
    'none',
  ];

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
                items={segments.map((p) => ({ value: p, label: GEN_LABELS[p] }))}
              />
            </div>
          </Field>

          {!selfHostedAllowed && (
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-pt-text-3)',
                lineHeight: 1.5,
              }}
            >
              Sign in to route note generation to a model on this machine or on your clinic network.
            </div>
          )}

          {genProvider === 'none' ? (
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-pt-text-2)',
                lineHeight: 1.5,
              }}
            >
              AI note generation is off — you can still write and edit notes manually.
            </div>
          ) : isSelfHostedProvider(genProvider) ? (
            <>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-pt-text-2)',
                  lineHeight: 1.5,
                }}
              >
                Transcripts go straight from this browser to the server below — they never reach
                PTScribe&apos;s servers.
              </div>
              <SelfHostedEndpointCard provider={genProvider} />
              <Field
                label="Fallback if it fails"
                hint="Offered in a dialog when the self-hosted call fails. Never used automatically — choosing it sends the transcript to the cloud."
                className="max-w-sm"
              >
                <Select
                  value={settings.ai.generation.cloudFallback ?? ''}
                  onChange={(e) =>
                    updateAi({
                      generation: {
                        ...settings.ai.generation,
                        cloudFallback: e.target.value
                          ? (e.target.value as CloudGenerationProvider)
                          : undefined,
                      },
                    })
                  }
                >
                  <option value="">No fallback</option>
                  {CLOUD_SEGMENTS.map((p) => (
                    <option key={p} value={p}>
                      {GEN_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
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
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-pt-text-2)',
                    lineHeight: 1.5,
                  }}
                >
                  Sign in to add your own {activeDescriptor?.label} API key. With your key, note
                  generation runs against your provider account.
                </div>
              ) : keys === null ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-3)' }}>
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
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-pt-text-2)',
                        lineHeight: 1.5,
                      }}
                    >
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
