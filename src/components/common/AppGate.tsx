import { useCallback, useState, type ReactNode } from 'react';
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
  // Synchronously validate the stored hash at init — tampered localStorage
  // gets cleared and resolves to 'locked' on the first render.
  const [status, setStatus] = useState<Status>(() => {
    const hash = getStoredGateHash();
    if (!hash) return 'locked';
    if (!checkStoredGateHash(hash)) {
      clearGateCode();
      return 'locked';
    }
    return 'unlocked';
  });

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
