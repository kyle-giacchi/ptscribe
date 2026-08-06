import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eyebrow, SegmentedControl } from '@/components/design';
import { IOSInstallBanner } from '@/components/settings/IOSInstallBanner';
import { VaultSecurityCard } from '@/components/settings/VaultSecurityCard';
import { SecurityComplianceCard } from '@/components/settings/SecurityComplianceCard';
import { AuditLogCard } from '@/components/settings/AuditLogCard';
import { DataRetentionCard } from '@/components/settings/DataRetentionCard';
import { ClinicianProfileCard } from '@/components/settings/ClinicianProfileCard';
import { AiProvidersCard } from '@/components/settings/AiProvidersCard';
import { AccountPlanCard } from '@/components/settings/AccountPlanCard';
import { PhiPrivacyCard } from '@/components/settings/PhiPrivacyCard';
import { PasskeySecurityPanel } from '@/components/settings/PasskeySecurityPanel';
import { isDemoMode } from '@/lib/demoMode';
import { AppearanceCard } from '@/components/settings/AppearanceCard';
import { RecordingWorkflowCard } from '@/components/settings/RecordingWorkflowCard';
import { AudioProcessingCard } from '@/components/settings/AudioProcessingCard';
import { LocalUsageCard } from '@/components/settings/LocalUsageCard';
import { BackupRestoreCard } from '@/components/settings/BackupRestoreCard';
import { RecoveryCodeCard } from '@/components/settings/RecoveryCodeCard';
import { OnDeviceModelCard } from '@/components/settings/OnDeviceModelCard';
import { DiagnosticsCard } from '@/components/settings/DiagnosticsCard';
import { ResetCard } from '@/components/settings/ResetCard';
import { Templates } from '@/pages/Templates';
import { Exercises } from '@/pages/Exercises';

/**
 * Tabs are path segments (`/settings/api`) rather than query params so that
 * NavLink active-state and the browser back button behave without special cases.
 */
const TABS = [
  {
    value: 'app',
    label: 'App settings',
    description: 'Clinician profile, appearance, recording, and your local data.',
    maxWidth: 720,
  },
  {
    value: 'api',
    label: 'API configuration',
    description: 'Transcription and note-generation providers, models, and keys.',
    maxWidth: 720,
  },
  {
    value: 'templates',
    label: 'Note templates',
    description: 'One template per visit type. Built-in formats are read-only.',
    maxWidth: 980,
  },
  {
    value: 'exercises',
    label: 'Exercises',
    description: "Reference catalog you can prescribe from a patient's plan of care.",
    maxWidth: 980,
  },
] as const;

type TabValue = (typeof TABS)[number]['value'];

interface SettingsGroupProps {
  title: string;
  description: string;
  children: ReactNode;
}

function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <details
      open
      className="settings-group"
      style={{
        borderRadius: 14,
        background: 'var(--color-pt-surface-alt)',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 4px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'grid', gap: 2 }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--color-pt-text)',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--color-pt-text-3)' }}>{description}</span>
        </div>
        <svg
          className="settings-group-chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            flexShrink: 0,
            color: 'var(--color-pt-text-3)',
            transition: 'transform 120ms ease-out',
          }}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <div className="settings-group-body" style={{ paddingBottom: 4 }}>
        {children}
      </div>
    </details>
  );
}

function AppSettingsTab() {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <IOSInstallBanner />

      <SettingsGroup
        title="Account & security"
        description="Plan, passkeys, vault, audit log, and recovery"
      >
        <AccountPlanCard />
        {/* Passkeys are meaningless in demo mode — the vault auto-unlocks. */}
        {!isDemoMode() && <PasskeySecurityPanel />}
        <VaultSecurityCard />
        <SecurityComplianceCard />
        <AuditLogCard />
        <RecoveryCodeCard />
      </SettingsGroup>

      <SettingsGroup title="Clinician & capture" description="Profile, appearance, recording">
        <ClinicianProfileCard />
        <AppearanceCard />
        <RecordingWorkflowCard />
        <AudioProcessingCard />
      </SettingsGroup>

      <SettingsGroup title="Data & backup" description="Retention, usage, backups, on-device model">
        <DataRetentionCard />
        <LocalUsageCard />
        <BackupRestoreCard />
        <OnDeviceModelCard />
      </SettingsGroup>

      <SettingsGroup title="Advanced" description="Diagnostics and reset">
        <DiagnosticsCard />
        <ResetCard />
      </SettingsGroup>
    </div>
  );
}

export function Settings() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  const active = (TABS.find((t) => t.value === tab)?.value ?? 'app') as TabValue;
  const activeTab = TABS.find((t) => t.value === active)!;

  return (
    <div style={{ padding: 22, width: '100%' }}>
      <style>{`
        .settings-group > summary::-webkit-details-marker { display: none; }
        .settings-group[open] > summary .settings-group-chevron { transform: rotate(180deg); }
        /* Flatten nested SurfaceCard chrome into a divided list — no boxes, no shadows. */
        .settings-group-body > * {
          background: transparent !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 14px 4px !important;
        }
        .settings-group-body > *:not(:last-child) {
          border-bottom: 1px solid var(--color-pt-border) !important;
        }
      `}</style>

      <div
        style={{
          maxWidth: activeTab.maxWidth,
          margin: '0 auto',
          display: 'grid',
          gap: 18,
          alignContent: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <Eyebrow>Settings</Eyebrow>
            <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
              {activeTab.description}
            </p>
          </div>
          <SegmentedControl
            value={active}
            onChange={(v) => navigate(v === 'app' ? '/settings' : `/settings/${v}`)}
            items={TABS.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>

        <div role="tabpanel" aria-label={activeTab.label}>
          {active === 'app' && <AppSettingsTab />}
          {active === 'api' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <AiProvidersCard />
              <PhiPrivacyCard />
            </div>
          )}
          {active === 'templates' && <Templates embedded />}
          {active === 'exercises' && <Exercises embedded />}
        </div>
      </div>
    </div>
  );
}
