// "Add to Home Screen" hint shown only on iOS Safari when not yet installed as
// a standalone PWA. Returns null on every other platform.
export function IOSInstallBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  if (!isIOS || isStandalone) return null;

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-pt-accent-border)',
        borderRight: '1px solid var(--color-pt-accent-border)',
        borderBottom: '1px solid var(--color-pt-accent-border)',
        borderLeft: '3px solid var(--color-pt-accent)',
        background: 'color-mix(in oklab, var(--color-pt-accent) 7%, var(--color-pt-surface))',
        borderRadius: 10,
        padding: '12px 14px',
        fontSize: 13,
        color: 'var(--color-pt-accent-fg)',
        lineHeight: 1.55,
      }}
    >
      For the best experience on iPhone, tap the <strong>Share</strong> button and select{' '}
      <strong>Add to Home Screen</strong>. This gives PTScribe more reliable storage and prevents
      the screen from dimming during sessions.
    </div>
  );
}
