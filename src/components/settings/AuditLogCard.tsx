import { Eyebrow, SurfaceCard } from '@/components/design';
import { AuditLogPanel } from '@/components/audit/AuditLogPanel';

export function AuditLogCard() {
  return (
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
  );
}
