import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, className, children }: FieldShellProps) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-xs font-medium" style={{ color: 'var(--color-fg-muted)' }}>
        {label}
      </span>
      {children}
      {error ? (
        <span className="block text-xs" style={{ color: 'var(--color-negative)' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

type TextProps = InputHTMLAttributes<HTMLInputElement>;
export const TextInput = forwardRef<HTMLInputElement, TextProps>(function TextInput(
  { className, type = 'text', ...rest },
  ref,
) {
  return <input ref={ref} type={type} className={cn('input', className)} {...rest} />;
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('input cursor-pointer', className)} {...rest}>
      {children}
    </select>
  );
});
