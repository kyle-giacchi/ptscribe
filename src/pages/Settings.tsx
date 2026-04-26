import { useRef } from 'react';
import { Download, Upload, ShieldAlert, Eraser, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { audioRepository } from '@/services/AudioRepository';
import { dataRepository } from '@/services/DataRepository';
import { vault } from '@/lib/vault/vault';
import { AppDataSchema, defaultAppData } from '@/schemas';
import { downloadFile } from '@/utils/download';

export function Settings() {
  const { clinician, setClinician } = useClinician();
  const { settings, updateAi, updateUi } = useSettings();
  const { appData, bulkUpdate, resetAll } = useAppData();
  const importRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(
      `ptnotes-backup-${stamp}.json`,
      JSON.stringify(appData, null, 2),
      'application/json',
    );
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
    if (
      !confirm('Erase ALL local data — patients, sessions, notes, audio? This cannot be undone.')
    ) {
      return;
    }
    try {
      await audioRepository.clear();
    } catch {
      /* ignore */
    }
    resetAll();
    await dataRepository.save(defaultAppData());
    toast.success('All local data erased');
  }

  return (
    <div
      style={{
        padding: 22,
        display: 'grid',
        gap: 14,
        alignContent: 'start',
        maxWidth: 880,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <Eyebrow>Settings</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Clinician profile, AI providers, and your local data.
        </p>
      </div>

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Eyebrow>Vault</Eyebrow>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-pt-text-3)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Your data on this device is encrypted with your passphrase. The key lives in this tab
            and is cleared when you close it. Use Lock now if you need to hand the device over.
          </p>
          <div>
            <PtButton
              variant="ghost"
              onClick={() => {
                vault.lock();
                window.location.reload();
              }}
            >
              Lock now
            </PtButton>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Clinician profile</Eyebrow>
          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
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
          </div>
          <Field label="Practice address">
            <TextInput
              value={clinician.practiceAddress ?? ''}
              onChange={(e) => setClinician({ practiceAddress: e.target.value })}
            />
          </Field>
          <Field label="Signature block" hint="Appended to exported notes.">
            <textarea
              className="input"
              style={{ minHeight: 80, fontSize: 13 }}
              value={clinician.signatureBlock ?? ''}
              onChange={(e) => setClinician({ signatureBlock: e.target.value })}
            />
          </Field>
        </div>
      </SurfaceCard>

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>AI providers</Eyebrow>
          <DisclaimerStrip>
            This testing build uses hosted credentials managed on the server, so audio and
            transcripts are proxied through our Cloudflare Worker on their way to Cloudflare Workers
            AI (Whisper) and Anthropic. Treat anything you record as PHI in transit. PTScribe is not
            HIPAA-certified.
          </DisclaimerStrip>

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
                <option value="cloudflare">Cloudflare Workers AI (Whisper)</option>
                <option value="webspeech">Browser live (Web Speech)</option>
                <option value="none">Off</option>
              </Select>
            </Field>
            <Field label="Whisper model" hint="Cloudflare model ID">
              <TextInput
                placeholder="@cf/openai/whisper-large-v3-turbo"
                value={settings.ai.transcription.model}
                onChange={(e) =>
                  updateAi({
                    transcription: { ...settings.ai.transcription, model: e.target.value },
                  })
                }
              />
            </Field>
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

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Appearance</Eyebrow>
          <div style={{ maxWidth: 280 }}>
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

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Eyebrow>Backup &amp; restore</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
            Your patient list, sessions, notes, templates, and exercises are exported as a single
            JSON file. Audio recordings stay in this browser and are not part of the JSON backup.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <PtButton
              variant="ghost"
              iconLeft={<Download size={14} strokeWidth={2} />}
              onClick={handleExport}
            >
              Download backup
            </PtButton>
            <PtButton
              variant="ghost"
              iconLeft={<Upload size={14} strokeWidth={2} />}
              onClick={() => importRef.current?.click()}
            >
              Restore from file
            </PtButton>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                if (importRef.current) importRef.current.value = '';
              }}
            />
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Eyebrow>Reset</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
            Erase all local data: patients, sessions, notes, templates, exercises, and audio. This
            cannot be undone.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <PtButton
              variant="ghost"
              iconLeft={<RefreshCw size={14} strokeWidth={2} />}
              onClick={() => window.location.reload()}
            >
              Reload app
            </PtButton>
            <PtButton
              variant="danger"
              iconLeft={<Eraser size={14} strokeWidth={2} />}
              onClick={handleReset}
            >
              Erase everything
            </PtButton>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

function DisclaimerStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
        fontSize: 12,
        color: 'var(--color-pt-text-2)',
        lineHeight: 1.5,
      }}
    >
      <ShieldAlert
        size={14}
        strokeWidth={1.75}
        style={{ marginTop: 2, flexShrink: 0, color: 'var(--color-pt-amber)' }}
      />
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}
