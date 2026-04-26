import { CommandPalette } from './CommandPalette';
import { useClinician } from '@/contexts/ClinicianProvider';

export function TopBar() {
  const { clinician } = useClinician();
  const greeting = clinician.name
    ? `${clinician.name}${clinician.credentials ? `, ${clinician.credentials}` : ''}`
    : 'PTScribe';
  return (
    <header
      className="flex h-16 items-center justify-between border-b px-6"
      style={{
        background: 'var(--color-bg)',
        borderColor: 'var(--color-border-soft)',
      }}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-display text-lg" style={{ color: 'var(--color-fg)' }}>
          {greeting}
        </span>
        {clinician.practiceName && (
          <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
            {clinician.practiceName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <CommandPalette />
      </div>
    </header>
  );
}
