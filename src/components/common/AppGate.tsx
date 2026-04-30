import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  checkGateCode,
  checkStoredGateHash,
  clearGateCode,
  getStoredGateHash,
  storeGateCode,
} from '@/lib/gate';
import { GateContext } from '@/contexts/GateContext';
import { Landing } from '@/pages/Landing';

type Status = 'locked' | 'unlocked';

export function AppGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (getStoredGateHash() ? 'unlocked' : 'locked'));

  // Validate stored hash on mount in case localStorage was tampered with
  useEffect(() => {
    const hash = getStoredGateHash();
    if (!hash) return;
    if (!checkStoredGateHash(hash)) {
      clearGateCode();
      setStatus('locked');
    }
  }, []);

  const logout = useCallback(() => {
    clearGateCode();
    setStatus('locked');
  }, []);

  if (status === 'unlocked')
    return <GateContext.Provider value={{ logout }}>{children}</GateContext.Provider>;

  async function handleSignIn(code: string): Promise<{ ok: boolean; error?: string }> {
    const ok = await checkGateCode(code);
    if (!ok) return { ok: false, error: 'Code not recognized.' };
    await storeGateCode(code);
    setStatus('unlocked');
    return { ok: true };
  }

  return <Landing onSignIn={handleSignIn} />;
}
