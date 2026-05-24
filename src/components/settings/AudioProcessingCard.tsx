import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';

export function AudioProcessingCard() {
  const { settings, updateAudio } = useSettings();

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Audio processing (experimental)</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Trim sustained silent regions and/or speed up playback before sending audio to Cloudflare
          Whisper. Recordings stay intact in this browser; only the copy uploaded for transcription
          is affected. Both options are off by default.
        </p>
        <div style={{ maxWidth: 280, display: 'grid', gap: 12 }}>
          <Field label="Silence trimming">
            <Select
              value={settings.audio.silenceDetection.enabled ? 'on' : 'off'}
              onChange={(e) =>
                updateAudio({
                  silenceDetection: {
                    ...settings.audio.silenceDetection,
                    enabled: e.target.value === 'on',
                  },
                })
              }
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </Select>
          </Field>

          {settings.audio.silenceDetection.enabled && (
            <>
              <Field label="Sensitivity">
                <Select
                  value={settings.audio.silenceDetection.sensitivity}
                  onChange={(e) =>
                    updateAudio({
                      silenceDetection: {
                        ...settings.audio.silenceDetection,
                        sensitivity: e.target.value as 'low' | 'medium' | 'high',
                      },
                    })
                  }
                >
                  <option value="low">Aggressive — drops more silence</option>
                  <option value="medium">Balanced — recommended</option>
                  <option value="high">Relaxed — only obvious dead air</option>
                </Select>
              </Field>

              <Field label="Padding (ms before/after each spoken segment)">
                <TextInput
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={String(settings.audio.silenceDetection.padMs)}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(2000, Number(e.target.value) || 0));
                    updateAudio({
                      silenceDetection: { ...settings.audio.silenceDetection, padMs: n },
                    });
                  }}
                />
              </Field>
            </>
          )}

          <Field label="Audio speed-up">
            <Select
              value={settings.audio.speedUp.enabled ? 'on' : 'off'}
              onChange={(e) =>
                updateAudio({
                  speedUp: { ...settings.audio.speedUp, enabled: e.target.value === 'on' },
                })
              }
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </Select>
          </Field>

          {settings.audio.speedUp.enabled && (
            <Field label="Speed factor">
              <Select
                value={String(settings.audio.speedUp.speed)}
                onChange={(e) =>
                  updateAudio({
                    speedUp: {
                      ...settings.audio.speedUp,
                      speed: Number(e.target.value) as 1.25 | 1.5 | 1.75,
                    },
                  })
                }
              >
                <option value="1.25">1.25× — subtle, saves ~20%</option>
                <option value="1.5">1.5× — recommended, saves ~33%</option>
                <option value="1.75">1.75× — aggressive, saves ~43%</option>
              </Select>
            </Field>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
