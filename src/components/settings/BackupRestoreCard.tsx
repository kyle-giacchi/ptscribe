import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useAppData } from '@/contexts/AppDataProvider';
import { exportBackup, importBackup } from '@/services/BackupService';
import { vault } from '@/lib/vault/vault';
import { auditLog } from '@/lib/audit/auditLog';
import { downloadFile } from '@/utils/download';

export function BackupRestoreCard() {
  const { appData, bulkUpdate } = useAppData();
  const importRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    if (!vault.isUnlocked()) {
      const ok = window.confirm(
        'The vault is not enabled. This backup will contain unencrypted clinical data. Continue?',
      );
      if (!ok) return;
    }
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

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Eyebrow>Backup &amp; restore</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          Your patient list, sessions, notes, templates, and exercises are exported as a single JSON
          file. Audio recordings stay in this browser and are not part of the JSON backup.
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
  );
}
