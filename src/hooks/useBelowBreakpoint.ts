import { useEffect, useState } from 'react';

export function useBelowBreakpoint(maxWidthPx: number): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(`(max-width: ${maxWidthPx - 1}px)`).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${maxWidthPx - 1}px)`);
    function onChange(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidthPx]);

  return matches;
}
