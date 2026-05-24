import { Field, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';

export function AppearanceCard() {
  const { settings, updateUi } = useSettings();

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Appearance</Eyebrow>
        <div style={{ maxWidth: 280, display: 'grid', gap: 10 }}>
          <Field label="Theme">
            <Select
              value={settings.ui.theme ?? 'system'}
              onChange={(e) => updateUi({ theme: e.target.value as 'system' | 'light' | 'dark' })}
            >
              <option value="system">System (follow OS preference)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Field>
          <Field label="Density">
            <Select
              value={settings.ui.densityMode}
              onChange={(e) => updateUi({ densityMode: e.target.value as 'cozy' | 'compact' })}
            >
              <option value="cozy">Cozy</option>
              <option value="compact">Compact</option>
            </Select>
          </Field>
        </div>
      </div>
    </SurfaceCard>
  );
}
