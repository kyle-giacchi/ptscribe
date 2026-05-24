import { Eyebrow } from '@/components/design';
import { IOSInstallBanner } from '@/components/settings/IOSInstallBanner';
import { VaultSecurityCard } from '@/components/settings/VaultSecurityCard';
import { SecurityComplianceCard } from '@/components/settings/SecurityComplianceCard';
import { AuditLogCard } from '@/components/settings/AuditLogCard';
import { DataRetentionCard } from '@/components/settings/DataRetentionCard';
import { ClinicianProfileCard } from '@/components/settings/ClinicianProfileCard';
import { AiProvidersCard } from '@/components/settings/AiProvidersCard';
import { AppearanceCard } from '@/components/settings/AppearanceCard';
import { RecordingWorkflowCard } from '@/components/settings/RecordingWorkflowCard';
import { AudioProcessingCard } from '@/components/settings/AudioProcessingCard';
import { LocalUsageCard } from '@/components/settings/LocalUsageCard';
import { BackupRestoreCard } from '@/components/settings/BackupRestoreCard';
import { OnDeviceModelCard } from '@/components/settings/OnDeviceModelCard';
import { DiagnosticsCard } from '@/components/settings/DiagnosticsCard';
import { ResetCard } from '@/components/settings/ResetCard';

export function Settings() {
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

      <IOSInstallBanner />
      <VaultSecurityCard />
      <SecurityComplianceCard />
      <AuditLogCard />
      <DataRetentionCard />
      <ClinicianProfileCard />
      <AiProvidersCard />
      <AppearanceCard />
      <RecordingWorkflowCard />
      <AudioProcessingCard />
      <LocalUsageCard />
      <BackupRestoreCard />
      <OnDeviceModelCard />
      <DiagnosticsCard />
      <ResetCard />
    </div>
  );
}
