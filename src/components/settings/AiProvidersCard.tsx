import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { useSettings } from '@/contexts/SettingsProvider';

export function AiProvidersCard() {
  const { settings, updateAi } = useSettings();

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

        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <Field label="Generation provider">
            <Select
              value={settings.ai.generation.provider}
              onChange={(e) =>
                updateAi({
                  generation: {
                    ...settings.ai.generation,
                    provider: e.target.value as typeof settings.ai.generation.provider,
                  },
                })
              }
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="none">Off (manual notes only)</option>
            </Select>
          </Field>
          <Field label="Claude model">
            <TextInput
              placeholder="claude-sonnet-4-6"
              value={settings.ai.generation.model}
              onChange={(e) =>
                updateAi({
                  generation: { ...settings.ai.generation, model: e.target.value },
                })
              }
            />
          </Field>
        </div>
      </div>
    </SurfaceCard>
  );
}
