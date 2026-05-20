import { useEffect, useRef, useState } from 'react';
import { useLocation, useMatch, Link, NavLink } from 'react-router-dom';
import { Bell, Menu, ArrowLeft, Lock, Unlock, RotateCcw, Terminal, AlertCircle, AlertTriangle, SlidersHorizontal, HardDrive, LogOut } from 'lucide-react';
import { useStorageEstimate } from '@/hooks/useStorageEstimate';
import { CommandPalette } from './CommandPalette';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSessions } from '@/contexts/SessionsProvider';
import { usePatients } from '@/contexts/PatientsProvider';
import { vault } from '@/lib/vault/vault';
import { labelForType } from '@/utils/labels';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { useSessionActions } from '@/contexts/SessionActionsContext';
import { useGate } from '@/contexts/GateContext';

function useVaultState(): { initialized: boolean; unlocked: boolean } {
  const [state, setState] = useState(() => ({
    initialized: vault.isInitialized(),
    unlocked: vault.isUnlocked(),
  }));

  useEffect(() => {
    const refresh = () =>
      setState({ initialized: vault.isInitialized(), unlocked: vault.isUnlocked() });
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ptnotes-vault') : null;
    if (bc) bc.onmessage = refresh;
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      bc?.close();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(interval);
    };
  }, []);

  return state;
}

export function VaultPill() {
  const { initialized, unlocked } = useVaultState();
  if (!initialized) return null;
  const Icon = unlocked ? Unlock : Lock;
  const label = unlocked ? 'Unlocked' : 'Locked';
  const tone = unlocked
    ? { fg: '#0a6d70', bg: '#e6f7f6', border: '#9fdcdc' }
    : { fg: 'var(--color-pt-text-2)', bg: 'var(--color-pt-surface-mut)', border: 'var(--color-pt-border)' };
  return (
    <span
      title={`Vault is ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1"
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.fg,
      }}
    >
      <Icon size={11} strokeWidth={2} />
      <span>Vault: {label}</span>
    </span>
  );
}

function formatRelativeTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export function AlertsButton() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const { localModelsUnavailable, available, loading: storageLoading } = useStorageEstimate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    markAllRead();
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, markAllRead]);

  const hasNotifications = notifications.length > 0;
  const hasUnread = unreadCount > 0;
  const storageWarning = !storageLoading && localModelsUnavailable;
  const hasItems = hasNotifications || storageWarning;
  // Red for unread notifications; amber when only a storage warning is present.
  const badgeColor = hasUnread ? '#dc2626' : '#d97706';
  const showBadge = hasUnread || storageWarning;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Warnings and errors${hasUnread ? ` — ${unreadCount} unread` : storageWarning ? ' — storage low' : ''}`}
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)] min-w-[44px] min-h-[44px]"
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          border: `1px solid ${open || showBadge ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
          background: open ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
          color: hasUnread ? '#dc2626' : storageWarning ? '#d97706' : open ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
          cursor: 'pointer',
        }}
      >
        <Bell size={15} strokeWidth={1.75} />
        {showBadge && (
          <span
            aria-hidden
            className="absolute flex items-center justify-center"
            style={{
              top: 6,
              right: 6,
              minWidth: 14,
              height: 14,
              padding: '0 2px',
              borderRadius: 7,
              background: badgeColor,
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
            }}
          >
            {hasUnread ? (unreadCount > 9 ? '9+' : unreadCount) : '!'}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50"
          style={{
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 320,
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{
              padding: '10px 14px 8px',
              borderBottom: hasItems ? '1px solid var(--color-pt-border)' : 'none',
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-pt-text)' }}>
              Warnings &amp; Errors
            </span>
            {hasNotifications && (
              <button
                type="button"
                onClick={clearAll}
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-pt-text-3)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {!hasItems ? (
            <div
              style={{
                padding: '20px 14px',
                textAlign: 'center',
                fontSize: 12.5,
                color: 'var(--color-pt-text-3)',
              }}
            >
              No warnings or errors
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflowY: 'auto' }}>
              {storageWarning && (
                <li
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '9px 14px',
                    borderBottom: hasNotifications ? '1px solid var(--color-pt-border)' : 'none',
                    alignItems: 'flex-start',
                    background: 'rgba(217, 119, 6, 0.05)',
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: 1, color: '#d97706' }}>
                    <HardDrive size={13} strokeWidth={2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text)', lineHeight: 1.45 }}>
                      Local models unavailable
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--color-pt-text-2)', lineHeight: 1.4 }}>
                      {available !== null
                        ? `${(available / (1024 * 1024)).toFixed(0)} MB free — on-device transcription and PII scrubbing need ~150 MB.`
                        : 'Storage is too low for on-device transcription and PII scrubbing (~150 MB required).'}
                    </p>
                  </div>
                </li>
              )}
              {notifications.map((n, i) => (
                <li
                  key={n.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '9px 14px',
                    borderBottom: i < notifications.length - 1 ? '1px solid var(--color-pt-border)' : 'none',
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      marginTop: 1,
                      color: n.level === 'error' ? '#dc2626' : '#d97706',
                    }}
                  >
                    {n.level === 'error' ? (
                      <AlertCircle size={13} strokeWidth={2} />
                    ) : (
                      <AlertTriangle size={13} strokeWidth={2} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-pt-text)', lineHeight: 1.45 }}>
                      {n.message}
                    </p>
                    <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)', marginTop: 2, display: 'block' }}>
                      {formatRelativeTime(n.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

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
    case '/account':
      return { title: 'User Settings', subtitle: 'Plan, time zone, transcription' };
    case '/debug':
      return { title: 'Debug', subtitle: 'Transcription tiers, raw session data' };
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

export function ProfileButton() {
  const { clinician } = useClinician();
  const { onResetSession } = useSessionActions();
  const { logout } = useGate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const initials = (clinician.name || 'PT')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="User profile"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)] min-w-[44px] min-h-[44px]"
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          border: `1px solid ${open ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
          background: open ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
          color: open ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
          cursor: 'pointer',
          fontSize: 11.5,
          fontWeight: 600,
        }}
      >
        {initials}
      </button>

      {open && (
        <div
          className="absolute z-50"
          style={{
            top: '100%',
            right: 0,
            marginTop: 6,
            minWidth: 160,
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '4px 0',
          }}
        >
          <div
            style={{
              padding: '8px 12px 6px',
              borderBottom: '1px solid var(--color-pt-border)',
            }}
          >
            <div
              className="truncate"
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-pt-text)' }}
            >
              {clinician.name || 'Clinician'}
            </div>
            <div
              className="truncate"
              style={{ fontSize: 10.5, color: 'var(--color-pt-text-3)', marginTop: 1 }}
            >
              {clinician.credentials || clinician.practiceName || 'PTScribe'}
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--color-pt-border)', margin: '2px 0' }} />
          <NavLink
            to="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
            style={{
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--color-pt-text-2)',
              textDecoration: 'none',
            }}
          >
            <SlidersHorizontal size={13} strokeWidth={1.75} />
            <span>User Settings</span>
          </NavLink>
          {onResetSession && (
            <>
              <div style={{ height: 1, background: 'var(--color-pt-border)', margin: '2px 0' }} />
              <button
                type="button"
                onClick={() => { setOpen(false); onResetSession(); }}
                className="flex w-full items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                style={{
                  padding: '7px 12px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--color-pt-danger, #dc2626)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <RotateCcw size={13} strokeWidth={1.75} />
                <span>Reset Session</span>
              </button>
            </>
          )}
          <NavLink
            to="/debug"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
            style={{
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--color-pt-text-2)',
              textDecoration: 'none',
            }}
          >
            <Terminal size={13} strokeWidth={1.75} />
            <span>Debug</span>
          </NavLink>
          <div style={{ height: 1, background: 'var(--color-pt-border)', margin: '2px 0' }} />
          <button
            type="button"
            onClick={() => { setOpen(false); logout(); }}
            className="flex w-full items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
            style={{
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--color-pt-danger, #dc2626)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <LogOut size={13} strokeWidth={1.75} />
            <span>Log out</span>
          </button>
        </div>
      )}
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
      className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)] md:hidden min-w-[44px] min-h-[44px]"
      style={{
        width: 44,
        height: 44,
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
      <VaultPill />
      <AlertsButton />
      <CommandPalette />
      <ProfileButton />
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
          className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)] min-w-[44px] min-h-[44px]"
          style={{
            width: 44,
            height: 44,
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
