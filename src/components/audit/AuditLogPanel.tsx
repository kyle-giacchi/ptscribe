import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { PtButton } from '@/components/design';
import { auditLog, type AuditEntry } from '@/lib/audit/auditLog';

const ACTION_LABELS: Record<string, string> = {
  'vault:unlocked': 'Vault unlocked',
  'vault:locked': 'Vault locked',
  'vault:passphrase_changed': 'Passphrase changed',
  'backup:exported': 'Backup exported',
  'backup:imported': 'Backup imported',
  'data:reset': 'Data reset',
  'note:generated': 'Note generated',
};

function fmt(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [integrity, setIntegrity] = useState<{
    valid: boolean;
    truncated: boolean;
    tamperedAt?: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    const all = auditLog.read();
    setEntries(all);
    const result = await auditLog.verify();
    setIntegrity(result);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleClear() {
    if (!confirm('Clear the audit log? This cannot be undone.')) return;
    auditLog.clear();
    setEntries([]);
    setIntegrity({ valid: true, truncated: false });
    toast.success('Audit log cleared');
  }

  const statusColor =
    integrity === null
      ? 'var(--color-pt-text-3)'
      : integrity.valid
        ? 'var(--color-pt-success, #22c55e)'
        : '#ef4444';

  const statusText =
    integrity === null
      ? 'Checking…'
      : integrity.valid
        ? integrity.truncated
          ? 'Chain intact (truncated — oldest entries rolled off)'
          : 'Chain intact'
        : `Chain broken at entry #${integrity.tamperedAt ?? '?'}`;

  const recent = entries.slice(-10).reverse();

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
          {entries.length} entries
          {entries.length > 0 && ` · oldest ${fmt(entries[0].ts)}`}
        </span>
        <span style={{ fontSize: 12, color: statusColor }}>{statusText}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PtButton variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide log' : 'View log'}
        </PtButton>
        <PtButton variant="ghost" onClick={() => void refresh()}>
          Verify chain
        </PtButton>
        {entries.length > 0 && (
          <PtButton variant="ghost" onClick={handleClear}>
            Clear log
          </PtButton>
        )}
      </div>
      {expanded && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: 1.6,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--color-pt-surface-2, rgba(255,255,255,0.04))',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          {recent.length === 0 ? (
            <span style={{ color: 'var(--color-pt-text-3)' }}>No entries</span>
          ) : (
            recent.map((e) => (
              <div key={e.seq} style={{ color: 'var(--color-pt-text-2)' }}>
                <span style={{ color: 'var(--color-pt-text-3)', marginRight: 8 }}>#{e.seq}</span>
                {fmt(e.ts)} — {ACTION_LABELS[e.action] ?? e.action}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
