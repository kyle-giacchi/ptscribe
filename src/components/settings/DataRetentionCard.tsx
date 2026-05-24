import { Field, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';

export function DataRetentionCard() {
  const { settings, setAutoDeleteAudioAfterDays } = useSettings();

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Data retention</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0, lineHeight: 1.5 }}>
          Audio recordings are the largest PHI artifact. Automatically delete clip audio after a set
          period — transcripts and notes are kept. Applied at next app start.
        </p>
        <div style={{ maxWidth: 280 }}>
          <Field
            label="Auto-delete audio after"
            hint="Deletes audio blobs from IndexedDB on next startup. Transcripts and notes are preserved."
          >
            <Select
              value={String(settings.retention.autoDeleteAudioAfterDays ?? '')}
              onChange={(e) =>
                setAutoDeleteAudioAfterDays(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">Off</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </Select>
          </Field>
        </div>
      </div>
    </SurfaceCard>
  );
}
