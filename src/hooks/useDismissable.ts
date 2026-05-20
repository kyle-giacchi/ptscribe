import { useEffect, type RefObject } from 'react';

interface UseDismissableOptions {
  open: boolean;
  onClose: () => void;
  ref: RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
  closeOnOutside?: boolean;
}

export function useDismissable({
  open,
  onClose,
  ref,
  closeOnEscape = true,
  closeOnOutside = true,
}: UseDismissableOptions): void {
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!closeOnOutside) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (closeOnEscape && e.key === 'Escape') onClose();
    }
    if (closeOnOutside) document.addEventListener('mousedown', onMouseDown);
    if (closeOnEscape) document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ref, closeOnEscape, closeOnOutside]);
}
