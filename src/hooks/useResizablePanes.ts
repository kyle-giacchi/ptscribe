import { useRef, useState, type PointerEvent, type RefObject } from 'react';

const MIN_PCT = 30;
const MAX_PCT = 70;

interface UseResizablePanes {
  /** Left-pane width as a percentage of the container. Resets to `initialPct` on mount. */
  notePct: number;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Attach to the divider's onPointerDown. */
  startResize: (e: PointerEvent) => void;
}

/** Drag-to-resize split pane, clamped to [30, 70]%. Live-drag only — no persistence. */
export function useResizablePanes(initialPct = 50): UseResizablePanes {
  const [notePct, setNotePct] = useState(initialPct);
  const containerRef = useRef<HTMLDivElement>(null);

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    function onMove(ev: globalThis.PointerEvent) {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setNotePct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
  }

  return { notePct, containerRef, startResize };
}
