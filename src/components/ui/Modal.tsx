import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

// Open-modal count, so a nested modal closing doesn't un-inert the app under its parent.
let openCount = 0;

export function Modal({ open, onClose, title, size = 'md', children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Background goes inert, focus moves in (unless a child autoFocused), and
  // returns to the trigger on close. The dialog is portalled out of #root so
  // inerting #root doesn't inert the dialog itself.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    openCount += 1;
    root?.setAttribute('inert', '');
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    return () => {
      openCount -= 1;
      if (openCount === 0) root?.removeAttribute('inert');
      trigger?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ overscrollBehavior: 'contain' }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ background: 'oklch(0.28 0.03 250 / 0.32)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.quick, ease: ease.standard }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            ref={dialogRef}
            tabIndex={-1}
            className={cn('card-hero relative w-full space-y-4 outline-none', SIZE[size])}
            style={{
              paddingTop: 'calc(2rem + env(safe-area-inset-top))',
              paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
            }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: duration.base, ease: ease.enter }}
          >
            {title && (
              <h3 id={titleId} className="font-display text-xl">
                {title}
              </h3>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
