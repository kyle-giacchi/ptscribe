import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      offset={16}
      gap={8}
      duration={3200}
      richColors
      closeButton
      containerAriaLabel="Notifications"
      toastOptions={{
        closeButtonAriaLabel: 'Dismiss notification',
        classNames: {
          toast:
            'card !bg-[var(--color-surface)] !border-[var(--color-border)] !text-[var(--color-fg)] !shadow-md !rounded-xl',
          title: 'font-medium',
          description: 'text-[var(--color-fg-muted)]',
          actionButton: '!bg-[var(--color-accent)] !text-white !rounded-md !px-3 !py-1 !text-xs',
          cancelButton:
            '!bg-[var(--color-surface-2)] !text-[var(--color-fg)] !rounded-md !px-3 !py-1 !text-xs',
          success: '!text-[var(--color-positive)]',
          error: '!text-[var(--color-negative)]',
          warning: '!text-[var(--color-caution)]',
          info: '!text-[var(--color-info)]',
        },
      }}
    />
  );
}
