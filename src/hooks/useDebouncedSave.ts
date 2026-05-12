import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedSave<T>(
  save: (data: T) => void,
  delayMs = 300,
): (next: T) => void {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(
    (next: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveRef.current(next);
      }, delayMs);
    },
    [delayMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return schedule;
}
