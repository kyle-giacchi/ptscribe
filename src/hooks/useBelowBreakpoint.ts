import { useEffect, useState } from 'react';

export function useBelowBreakpoint(maxWidthPx: number): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < maxWidthPx,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onResize() {
      setMatches(window.innerWidth < maxWidthPx);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [maxWidthPx]);

  return matches;
}
