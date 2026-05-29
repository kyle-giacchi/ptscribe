export function ReviewEmptyState() {
  return (
    <div
      role="tabpanel"
      id="panel-review"
      aria-labelledby="tab-review"
      style={{
        padding: '44px 24px',
        textAlign: 'center',
        borderRadius: 12,
        border: '1px dashed var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-fg)', marginBottom: 6 }}>
        Nothing to review yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-fg-subtle)', lineHeight: 1.6 }}>
        Record a clip or upload audio, then come back here.
      </div>
    </div>
  );
}
