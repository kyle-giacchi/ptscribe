import { Field, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';

export function PhiPrivacyCard() {
  const { settings, updateSession } = useSettings();

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>PHI &amp; scrubbing</Eyebrow>
        <div style={{ maxWidth: 360, display: 'grid', gap: 12 }}>
          <Field
            label="Confirm before sending to the note provider"
            hint="Generating a note sends the transcript off of your device. When on, a prompt lets you verify there is no PHI first."
          >
            <Select
              value={settings.session.phiConfirmDismissed ? 'off' : 'on'}
              onChange={(e) => updateSession({ phiConfirmDismissed: e.target.value === 'off' })}
            >
              <option value="on">On — confirm each Generate (recommended)</option>
              <option value="off">Off — send immediately</option>
            </Select>
          </Field>
          <Field
            label="On-device PII detection model"
            hint="Used by Scrub PII. Runs entirely in your browser — no text leaves the device. Takes effect on the next scrub."
          >
            <Select
              value={settings.session.piiModel ?? 'openai/privacy-filter'}
              onChange={(e) =>
                updateSession({ piiModel: e.target.value as 'openai/privacy-filter' })
              }
            >
              <option value="openai/privacy-filter">
                OpenAI Privacy Filter (recommended) — needs R2-seeded ONNX files
              </option>
              <option value="Xenova/bert-base-NER">
                BERT Base NER — names/orgs/locations, downloads from HuggingFace
              </option>
            </Select>
          </Field>
        </div>
      </div>
    </SurfaceCard>
  );
}
