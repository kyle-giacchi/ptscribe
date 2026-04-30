import { useLocation, useMatch, Link } from 'react-router-dom';
import { Bell, Menu, ArrowLeft } from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { labelForType } from '@/utils/labels';

interface TopBarProps {
  onMenuOpen?: () => void;
}

function usePageTitle(): { title: string; subtitle?: string } {
  const location = useLocation();
  const patientMatch = useMatch('/patients/:id');

  if (patientMatch) return { title: 'Patient chart', subtitle: 'Overview' };

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

function RecordingIndicator({ status }: { status: string }) {
  const isRecording = status === 'recording';
  return (
    <div
      className="flex items-center gap-1.5"
      style={{ color: isRecording ? 'var(--color-pt-red, #dc2626)' : 'var(--color-pt-text-3)' }}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {isRecording && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: 'var(--color-pt-red, #dc2626)' }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{
            background: isRecording ? 'var(--color-pt-red, #dc2626)' : 'var(--color-pt-text-3)',
          }}
        />
      </span>
      <span style={{ fontSize: 12, fontWeight: 500 }}>{isRecording ? 'Recording' : 'Idle'}</span>
    </div>
  );
}

export function TopBar({ onMenuOpen }: TopBarProps) {
  // All hooks called unconditionally
  const { title, subtitle } = usePageTitle();
  const { clinician } = useClinician();
  const sessionMatch = useMatch('/sessions/:id');
  const { getSession } = useSessions();
  const { getPatient } = usePatients();

  const session = sessionMatch ? getSession(sessionMatch.params.id ?? '') : undefined;
  const patient = session ? getPatient(session.patientId) : undefined;
  const isSessionRoute = Boolean(sessionMatch && session && patient);
  const fullName = patient ? `${patient.firstName} ${patient.lastName}`.trim() || 'Patient' : '';

  const menuButton = (
    <button
      type="button"
      aria-label="Open menu"
      onClick={onMenuOpen}
      className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)] md:hidden"
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
  );

  const rightActions = (
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
  );

  if (isSessionRoute && session && patient) {
    return (
      <header
        className="flex items-center gap-3"
        style={{
          background: 'var(--color-pt-surface)',
          borderBottom: '1px solid var(--color-pt-border)',
          padding: '12px 22px',
        }}
      >
        <div className="mr-1 md:hidden">{menuButton}</div>
        <Link
          to={`/patients/${patient.id}`}
          aria-label="Back to patient chart"
          className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid var(--color-pt-border)',
            color: 'var(--color-pt-text-2)',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={14} strokeWidth={2} />
        </Link>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '-0.2px',
              color: 'var(--color-pt-text)',
            }}
          >
            {fullName}
          </div>
          <div
            className="truncate"
            style={{ fontSize: 12, color: 'var(--color-pt-text-2)', marginTop: 1 }}
          >
            {labelForType(session.type)} · {new Date(session.date).toLocaleDateString()}
          </div>
        </div>
        <RecordingIndicator status={session.status} />
        {rightActions}
      </header>
    );
  }

  return (
    <header
      className="flex items-center justify-between"
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '16px 22px',
      }}
    >
      <div className="mr-3 md:hidden">{menuButton}</div>
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
        {(subtitle || clinician.name) && (
          <div
            className="truncate"
            style={{ fontSize: 12.5, color: 'var(--color-pt-text-2)', marginTop: 2 }}
          >
            {subtitle}
            {subtitle && clinician.name ? ' · ' : ''}
            {clinician.name && <span>{clinician.name}</span>}
          </div>
        )}
      </div>
      {rightActions}
    </header>
  );
}
