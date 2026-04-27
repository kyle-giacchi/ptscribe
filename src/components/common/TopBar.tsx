import { useLocation, useMatch } from 'react-router-dom';
import { Bell, Menu } from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import { useClinician } from '@/contexts/ClinicianProvider';

interface TopBarProps {
  onMenuOpen?: () => void;
}

interface PageMeta {
  title: string;
  subtitle?: string;
}

function usePageMeta(): PageMeta {
  const location = useLocation();
  const patientMatch = useMatch('/patients/:id');
  const sessionMatch = useMatch('/sessions/:id');

  if (patientMatch) return { title: 'Patient chart', subtitle: 'Overview' };
  if (sessionMatch) return { title: 'Active session', subtitle: 'Recording in progress' };

  switch (location.pathname) {
    case '/':
      return { title: "Today's dashboard", subtitle: 'Schedule, sign-off queue, audio check' };
    case '/patients':
      return { title: 'Patients', subtitle: 'Active caseload' };
    case '/sessions/new':
      return { title: 'New session', subtitle: 'Pick a patient to begin recording' };
    case '/notes':
      return { title: 'Review queue', subtitle: 'Notes awaiting your signature' };
    case '/templates':
      return { title: 'Templates', subtitle: 'SOAP and progress note formats' };
    case '/exercises':
      return { title: 'Exercise library', subtitle: 'Built-in and custom exercises' };
    case '/settings':
      return { title: 'Settings', subtitle: 'Clinician profile, AI keys, data' };
    default:
      return { title: 'PTScribe' };
  }
}

export function TopBar({ onMenuOpen }: TopBarProps) {
  const { title, subtitle } = usePageMeta();
  const { clinician } = useClinician();

  const greeting = clinician.name
    ? clinician.name
    : null;

  return (
    <header
      className="flex items-center justify-between"
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '16px 22px',
      }}
    >
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuOpen}
        className="mr-3 flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)] md:hidden"
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          border: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
          color: 'var(--color-pt-text-2)',
          flexShrink: 0,
        }}
      >
        <Menu size={16} strokeWidth={1.75} />
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.2px',
            color: 'var(--color-pt-text)',
          }}
        >
          {title}
        </div>
        {(subtitle || greeting) && (
          <div
            className="truncate"
            style={{
              fontSize: 12.5,
              color: 'var(--color-pt-text-2)',
              marginTop: 2,
            }}
          >
            {subtitle}
            {subtitle && greeting ? ' · ' : ''}
            {greeting && <span>{greeting}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Notifications"
          className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid var(--color-pt-border)',
            background: 'var(--color-pt-surface)',
            color: 'var(--color-pt-text-2)',
          }}
        >
          <Bell size={15} strokeWidth={1.75} />
        </button>
        <CommandPalette />
      </div>
    </header>
  );
}
