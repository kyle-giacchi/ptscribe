import { Field, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';

export function RecordingWorkflowCard() {
  const { settings, updateSession } = useSettings();

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Recording workflow</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          When auto-finish is on, the recording panel shows a one-tap{' '}
          <strong>Stop &amp; finish</strong> button that chains stop → transcribe → generate. Turn
          off if you prefer to advance each step yourself.
        </p>
        <div style={{ maxWidth: 280, display: 'grid', gap: 12 }}>
          <Field label="Auto-finish chain">
            <Select
              value={settings.session.autoFinish ? 'on' : 'off'}
              onChange={(e) => updateSession({ autoFinish: e.target.value === 'on' })}
            >
              <option value="on">On — show Stop &amp; finish</option>
              <option value="off">Off — manual steps only</option>
            </Select>
          </Field>
          <Field label="Live Web Speech captions">
            <Select
              value={settings.session.webSpeechEnabled ? 'on' : 'off'}
              onChange={(e) => updateSession({ webSpeechEnabled: e.target.value === 'on' })}
            >
              <option value="off">Off — Whisper only (default, private)</option>
              <option value="on">On — add browser captions alongside Whisper</option>
            </Select>
          </Field>
        </div>
      </div>
    </SurfaceCard>
  );
}
