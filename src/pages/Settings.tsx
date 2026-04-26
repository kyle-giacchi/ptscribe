import { useRef, useState } from 'react';
import {
  Settings as SettingsIcon,
  Download,
  Upload,
  ShieldAlert,
  Eraser,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { audioRepository } from '@/services/AudioRepository';
import { dataRepository } from '@/services/DataRepository';
import { AppDataSchema, defaultAppData } from '@/schemas';
import { downloadFile } from '@/utils/download';

export function Settings() {
  const { clinician, setClinician } = useClinician();
  const { settings, updateAi, updateUi } = useSettings();
  const { appData, bulkUpdate, resetAll } = useAppData();
  const importRef = useRef<HTMLInputElement>(null);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

  function handleExport() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(`ptnotes-backup-${stamp}.json`, JSON.stringify(appData, null, 2), 'application/json');
    toast.success('Backup downloaded');
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = AppDataSchema.safeParse(parsed);
      if (!result.success) {
        toast.error('Backup file is invalid or from a different version.');
        return;
      }
      bulkUpdate(result.data);
      toast.success('Backup restored');
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  }

  async function handleReset() {
    if (!confirm('Erase ALL local data — patients, sessions, notes, audio? This cannot be undone.')) {
      return;
    }
    try {
      await audioRepository.clear();
    } catch {
      /* ignore */
    }
    resetAll();
    dataRepository.save(defaultAppData());
    toast.success('All local data erased');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Clinician profile, AI providers, and your local data."
        Icon={SettingsIcon}
      />

      <section className="card space-y-3">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Clinician profile
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              value={clinician.name}
              onChange={(e) => setClinician({ name: e.target.value })}
            />
          </Field>
          <Field label="Credentials" hint="DPT, OCS, etc.">
            <TextInput
              value={clinician.credentials}
              onChange={(e) => setClinician({ credentials: e.target.value })}
            />
          </Field>
          <Field label="Practice name">
            <TextInput
              value={clinician.practiceName ?? ''}
              onChange={(e) => setClinician({ practiceName: e.target.value })}
            />
          </Field>
          <Field label="NPI">
            <TextInput
              value={clinician.npi ?? ''}
              onChange={(e) => setClinician({ npi: e.target.value })}
            />
          </Field>
          <Field label="Practice address" className="sm:col-span-2">
            <TextInput
              value={clinician.practiceAddress ?? ''}
              onChange={(e) => setClinician({ practiceAddress: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <TextInput
              value={clinician.phone ?? ''}
              onChange={(e) => setClinician({ phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <TextInput
              value={clinician.email ?? ''}
              onChange={(e) => setClinician({ email: e.target.value })}
            />
          </Field>
          <Field label="Signature block" className="sm:col-span-2" hint="Appended to exported notes.">
            <textarea
              className="input min-h-20"
              value={clinician.signatureBlock ?? ''}
              onChange={(e) => setClinician({ signatureBlock: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          AI providers
        </h2>
        <div
          className="flex gap-2 rounded-lg border p-3 text-xs"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-fg-muted)',
          }}
        >
          <ShieldAlert
            size={14}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--color-caution)' }}
          />
          <p>
            Keys live only in this browser's localStorage and are sent directly to OpenAI / Anthropic.
            PTScribe is not HIPAA-certified — confirm BAA terms with your providers before using PHI.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
              <option value="openai">OpenAI Whisper</option>
              <option value="webspeech">Browser live (Web Speech)</option>
              <option value="none">Off</option>
            </Select>
          </Field>
          <Field label="Whisper model">
            <TextInput
              placeholder="whisper-1"
              value={settings.ai.transcription.model}
              onChange={(e) =>
                updateAi({
                  transcription: { ...settings.ai.transcription, model: e.target.value },
                })
              }
            />
          </Field>
          <Field label="OpenAI API key" className="sm:col-span-2">
            <div className="flex gap-2">
              <TextInput
                type={showOpenAiKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={settings.ai.transcription.apiKey ?? ''}
                onChange={(e) =>
                  updateAi({
                    transcription: { ...settings.ai.transcription, apiKey: e.target.value || undefined },
                  })
                }
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setShowOpenAiKey((v) => !v)}
              >
                {showOpenAiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>

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
          <Field label="Anthropic API key" className="sm:col-span-2">
            <div className="flex gap-2">
              <TextInput
                type={showAnthropicKey ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={settings.ai.generation.apiKey ?? ''}
                onChange={(e) =>
                  updateAi({
                    generation: { ...settings.ai.generation, apiKey: e.target.value || undefined },
                  })
                }
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setShowAnthropicKey((v) => !v)}
              >
                {showAnthropicKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Appearance
        </h2>
        <Field label="Density">
          <Select
            value={settings.ui.densityMode}
            onChange={(e) => updateUi({ densityMode: e.target.value as 'cozy' | 'compact' })}
          >
            <option value="cozy">Cozy</option>
            <option value="compact">Compact</option>
          </Select>
        </Field>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Backup & restore
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-fg-muted)' }}>
          Your patient list, sessions, notes, templates, and exercises are exported as a single JSON
          file. Audio recordings stay in this browser and are not part of the JSON backup.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            <Download size={14} strokeWidth={2} /> Download backup
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => importRef.current?.click()}
          >
            <Upload size={14} strokeWidth={2} /> Restore from file
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              if (importRef.current) importRef.current.value = '';
            }}
          />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          Reset
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-fg-muted)' }}>
          Erase all local data: patients, sessions, notes, templates, exercises, and audio. This
          cannot be undone.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            <RefreshCw size={14} strokeWidth={2} /> Reload app
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--color-negative)' }}
            onClick={handleReset}
          >
            <Eraser size={14} strokeWidth={2} /> Erase everything
          </button>
        </div>
      </section>
    </div>
  );
}
