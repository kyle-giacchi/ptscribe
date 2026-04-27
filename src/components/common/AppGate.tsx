import { useEffect, useState, type ReactNode } from 'react';
import { checkGateCode, getStoredGateCode, storeGateCode } from '@/lib/gate';
import { Landing } from '@/pages/Landing';

type Status = 'locked' | 'unlocked';

export function AppGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() =>
    getStoredGateCode() ? 'unlocked' : 'locked',
  );

  // Async-validate stored code in case it was tampered with
  useEffect(() => {
    const stored = getStoredGateCode();
    if (!stored) return;
    let cancelled = false;
    void (async () => {
      const ok = await checkGateCode(stored);
      if (cancelled || ok) return;
      setStatus('locked');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'unlocked') return <>{children}</>;

  async function handleSignIn(code: string): Promise<{ ok: boolean; error?: string }> {
    const ok = await checkGateCode(code);
    if (!ok) return { ok: false, error: 'Code not recognized.' };
    storeGateCode(code);
    setStatus('unlocked');
    return { ok: true };
  }

  return <Landing onSignIn={handleSignIn} />;
}
