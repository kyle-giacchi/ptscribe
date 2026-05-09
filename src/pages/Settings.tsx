import { useMemo, useRef, useState } from 'react';
import { Copy, Download, Upload, Eraser, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { useAppData } from '@/contexts/AppDataProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { useNotes } from '@/contexts/NotesProvider';
import { audioRepository } from '@/services/AudioRepository';
import { dataRepository } from '@/services/DataRepository';
import { exportBackup, importBackup } from '@/services/BackupService';
import { vault } from '@/lib/vault/vault';
import { ChangePassphraseForm } from '@/components/vault/ChangePassphraseForm';
import { auditLog } from '@/lib/audit/auditLog';
import { AuditLogPanel } from '@/components/audit/AuditLogPanel';
import { defaultAppData } from '@/schemas';
import { downloadFile } from '@/utils/download';
import type { Note, Session } from '@/types';

function describeVaultStatus(
  unlocked: boolean,
  initialized: boolean,
): { label: string; color: string } {
  if (!initialized) return { label: 'Vault: not initialized', color: 'var(--color-pt-text-3)' };
  if (unlocked) return { label: 'Vault: unlocked', color: '#16a34a' };
  return { label: 'Vault: locked', color: '#dc2626' };
}

function describeDisclosure(at: number | undefined, version: number | undefined): string {
  if (!at || !version) return '—';
  return `Disclosure v${version} acknowledged ${new Date(at).toLocaleDateString()}`;
}

function buildOnboardingLink(origin: string, practiceName: string | undefined): string {
  const base = `${origin}/setup?role=clinician`;
  return practiceName ? `${base}&clinic=${encodeURIComponent(practiceName)}` : base;
}

interface UsageBucket {
  key: string;
  label: string;
  sessions: number;
  notes: number;
}

function bucketUsageByMonth(sessions: Session[], notes: Note[]): UsageBucket[] {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: fmt(d), label: d.toLocaleString(undefined, { month: 'short' }) });
  }
  const sessionByMonth = new Map<string, number>();
  for (const s of sessions) {
    const k = fmt(new Date(s.date));
    sessionByMonth.set(k, (sessionByMonth.get(k) ?? 0) + 1);
  }
  const noteByMonth = new Map<string, number>();
  for (const n of notes) {
    const k = fmt(new Date(n.createdAt));
    noteByMonth.set(k, (noteByMonth.get(k) ?? 0) + 1);
  }
  return months.map((m) => ({
    key: m.key,
    label: m.label,
    sessions: sessionByMonth.get(m.key) ?? 0,
    notes: noteByMonth.get(m.key) ?? 0,
  }));
}

export function Settings() {
  const { clinician, setClinician } = useClinician();
  const {
    settings,
    updateAi,
    updateAudio,
    updateUi,
    updateSession,
    setIdleLockMinutes,
    setAutoDeleteAudioAfterDays,
  } = useSettings();
  const { appData, bulkUpdate, resetAll } = useAppData();
  const { sessions } = useSessions();
  const { notes } = useNotes();
  const importRef = useRef<HTMLInputElement>(null);
  const [showFullDisclosure, setShowFullDisclosure] = useState(false);

  // ── A1 "Security & compliance" summary card ────────────────────────────────
  // Decision: keep the existing Vault & security and Data retention cards as-is
  // (they own the actual mutators) and render a compact summary here that
  // surfaces vault state, disclosure acknowledgement, and a re-show toggle. The
  // summary footer cross-links to the detail cards rather than duplicating
  // their selects.
  const vaultUnlocked = vault.isUnlocked();
  const vaultStatus = describeVaultStatus(vaultUnlocked, vault.isInitialized());
  const disclosureLine = describeDisclosure(
    clinician.acknowledgedDisclosureAt,
    settings.firstRun.disclosureVersion,
  );

  // ── B8 "Local usage" stats ────────────────────────────────────────────────
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.durationMin ?? 0), 0);
  const totalNotesFinalized = notes.filter((n) => n.finalized).length;
  const monthlyBuckets = useMemo(
    () => bucketUsageByMonth(sessions, notes),
    [sessions, notes],
  );
  const usageMax = Math.max(1, ...monthlyBuckets.flatMap((b) => [b.sessions, b.notes]));

  // D14 — Copy onboarding link. Practice name is optional; we omit the param
  // when missing rather than disabling the button.
  function handleCopyOnboardingLink() {
    const url = buildOnboardingLink(window.location.origin, clinician.practiceName);
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Onboarding link copied'))
      .catch(() => toast.error('Could not copy link'));
  }

  async function handleExport() {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const text = await exportBackup(appData);
      const suffix = vault.isUnlocked() ? 'encrypted' : 'plaintext';
      downloadFile(`ptnotes-backup-${stamp}-${suffix}.json`, text, 'application/json');
      void auditLog.append('backup:exported');
      toast.success(
        vault.isUnlocked()
          ? 'Encrypted backup downloaded — restoring it requires this vault passphrase.'
          : 'Backup downloaded (unencrypted — set up a vault passphrase to encrypt future backups).',
      );
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const result = await importBackup(text);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      bulkUpdate(result.data);
      void auditLog.append('backup:imported');
      toast.success(result.encrypted ? 'Encrypted backup restored' : 'Backup restored');
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
    void auditLog.append('data:reset');
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
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Vault &amp; security</Eyebrow>
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
          <div style={{ maxWidth: 280 }}>
            <Field
              label="Auto-lock after inactivity"
              hint="Locks the vault after this much idle time. Pointer, key, or tab activity resets the timer."
            >
              <Select
                value={String(settings.security.idleLockMinutes)}
                onChange={(e) => setIdleLockMinutes(Number(e.target.value))}
              >
                <option value="0">Off</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
              </Select>
            </Field>
          </div>
          <ChangePassphraseForm />
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

      <SecurityComplianceCard
        vaultStatus={vaultStatus}
        vaultUnlocked={vaultUnlocked}
        disclosureLine={disclosureLine}
        showFullDisclosure={showFullDisclosure}
        onToggleDisclosure={() => setShowFullDisclosure((v) => !v)}
      />

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Audit log</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0, lineHeight: 1.5 }}>
            Hash-chained record of vault access, note generation, and backup events. Use "Verify
            chain" to confirm no entries were deleted or modified.
          </p>
          <AuditLogPanel />
        </div>
      </SurfaceCard>

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Data retention</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0, lineHeight: 1.5 }}>
            Audio recordings are the largest PHI artifact. Automatically delete clip audio after a
            set period — transcripts and notes are kept. Applied at next app start.
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <PtButton
              variant="ghost"
              iconLeft={<Copy size={14} strokeWidth={2} />}
              onClick={handleCopyOnboardingLink}
            >
              Copy clinician onboarding link
            </PtButton>
          </div>
        </div>
      </SurfaceCard>

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
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Recording workflow</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
            When auto-finish is on, the recording panel shows a one-tap{' '}
            <strong>Stop &amp; finish</strong> button that chains stop → transcribe → generate. Turn
            off if you prefer to advance each step yourself.
          </p>
          <div style={{ maxWidth: 280 }}>
            <Field label="Auto-finish chain">
              <Select
                value={settings.session.autoFinish ? 'on' : 'off'}
                onChange={(e) => updateSession({ autoFinish: e.target.value === 'on' })}
              >
                <option value="on">On — show Stop &amp; finish</option>
                <option value="off">Off — manual steps only</option>
              </Select>
            </Field>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Eyebrow>Audio processing (experimental)</Eyebrow>
          <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
            Trim sustained silent regions and/or speed up playback before sending audio to
            Cloudflare Whisper. Recordings stay intact in this browser; only the copy uploaded for
            transcription is affected. Both options are off by default.
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

      <LocalUsageCard
        totalSessions={sessions.length}
        totalMinutes={totalMinutes}
        totalNotesFinalized={totalNotesFinalized}
        monthlyBuckets={monthlyBuckets}
        usageMax={usageMax}
      />

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

interface SecurityComplianceCardProps {
  vaultStatus: { label: string; color: string };
  vaultUnlocked: boolean;
  disclosureLine: string;
  showFullDisclosure: boolean;
  onToggleDisclosure: () => void;
}

function SecurityComplianceCard({
  vaultStatus,
  vaultUnlocked,
  disclosureLine,
  showFullDisclosure,
  onToggleDisclosure,
}: SecurityComplianceCardProps) {
  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Security &amp; compliance</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: vaultStatus.color,
              flex: '0 0 auto',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-pt-text-1)' }}>{vaultStatus.label}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-pt-text-2)' }}>{disclosureLine}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {vaultUnlocked && (
            <PtButton
              variant="ghost"
              onClick={() => {
                vault.lock();
                window.location.reload();
              }}
            >
              Lock now
            </PtButton>
          )}
          <PtButton variant="ghost" onClick={onToggleDisclosure}>
            {showFullDisclosure ? 'Hide full disclosure' : 'Re-show full disclosure'}
          </PtButton>
        </div>
        {showFullDisclosure && <HipaaDisclosure variant="full" />}
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-pt-text-3)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Idle-lock timing lives in the Vault &amp; security card above; audio retention lives in
          the Data retention card below.
        </p>
      </div>
    </SurfaceCard>
  );
}

interface LocalUsageCardProps {
  totalSessions: number;
  totalMinutes: number;
  totalNotesFinalized: number;
  monthlyBuckets: UsageBucket[];
  usageMax: number;
}

function LocalUsageCard({
  totalSessions,
  totalMinutes,
  totalNotesFinalized,
  monthlyBuckets,
  usageMax,
}: LocalUsageCardProps) {
  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Local usage</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Counts derived from local data; nothing leaves this device.
        </p>
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}
        >
          <UsageStat label="Sessions" value={String(totalSessions)} />
          <UsageStat label="Minutes recorded" value={String(Math.round(totalMinutes))} />
          <UsageStat label="Notes finalized" value={String(totalNotesFinalized)} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-pt-text-3)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Last 6 months
          </div>
          <UsageBarChart data={monthlyBuckets} max={usageMax} />
          <div
            style={{
              display: 'flex',
              gap: 14,
              fontSize: 11,
              color: 'var(--color-pt-text-3)',
            }}
          >
            <LegendSwatch color="var(--color-pt-accent, #6366f1)" label="Sessions" />
            <LegendSwatch color="var(--color-pt-text-2, #94a3b8)" label="Notes" />
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-pt-border, rgba(0,0,0,0.08))',
        background: 'var(--color-pt-surface-2, rgba(0,0,0,0.02))',
        display: 'grid',
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: 'var(--color-pt-text-3)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-pt-text-1)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden
        style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }}
      />
      {label}
    </span>
  );
}

// Inline SVG grouped-bar chart. recharts isn't in package.json (verified) and
// pulling visx in for a 6-bucket compact chart is overkill, so this is the
// documented fallback path the task allows. Brand accent colors fall back to
// hex when the CSS variable hasn't been resolved.
function UsageBarChart({ data, max }: { data: UsageBucket[]; max: number }) {
  const height = 180;
  const padTop = 8;
  const padBottom = 22;
  const innerH = height - padTop - padBottom;
  const groupCount = data.length;
  const sessionFill = 'var(--color-pt-accent, #6366f1)';
  const noteFill = 'var(--color-pt-text-2, #94a3b8)';

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${groupCount * 60} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Sessions and notes per month over the last 6 months"
    >
      {data.map((b, i) => {
        const groupX = i * 60;
        const barW = 22;
        const sessionsH = (b.sessions / max) * innerH;
        const notesH = (b.notes / max) * innerH;
        return (
          <g key={b.key}>
            <rect
              x={groupX + 6}
              y={padTop + (innerH - sessionsH)}
              width={barW}
              height={sessionsH}
              fill={sessionFill}
              rx={2}
            />
            <rect
              x={groupX + 32}
              y={padTop + (innerH - notesH)}
              width={barW}
              height={notesH}
              fill={noteFill}
              rx={2}
            />
            <text
              x={groupX + 30}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-pt-text-3)"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
