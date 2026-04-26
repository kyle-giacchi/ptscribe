export interface CPTBillRowProps {
  code: string;
  label: string;
  units: number;
}

export function CPTBillRow({ code, label, units }: CPTBillRowProps) {
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: '60px 1fr auto',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'var(--color-pt-surface-mut)',
        border: '1px solid var(--color-pt-border)',
      }}
    >
      <span
        className="font-mono"
        style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-pt-text)' }}
      >
        {code}
      </span>
      <span
        className="truncate"
        style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)' }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 11.5, color: 'var(--color-pt-text-2)' }}
      >
        ×{units}
      </span>
    </div>
  );
}
