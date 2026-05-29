import { useRef, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Users,
  Mic,
  CheckSquare,
  Dumbbell,
  ClipboardList,
  LogOut,
  Settings as SettingsIcon,
  Terminal,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import { useNotes } from '@/contexts/NotesProvider';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useGate } from '@/contexts/GateContext';
import { useDebugDrawer } from '@/contexts/DebugDrawerProvider';
import { DEBUG_TOOLS_ENABLED } from '@/lib/debug/flags';

interface NavEntry {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
}

type Badge = { kind: 'live' } | { kind: 'count'; value: number };

interface SidebarProps {
  onClose?: () => void;
  className?: string;
}

export function Sidebar({ onClose, className }: SidebarProps) {
  const { notes } = useNotes();
  const { clinician } = useClinician();
  const { logout } = useGate();
  const { openDebug } = useDebugDrawer();
  const pendingReviewCount = notes.filter((n) => !n.finalized).length;
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  const items: Array<NavEntry & { badge?: Badge }> = [
    { to: '/today', label: 'Today', Icon: Calendar },
    { to: '/patients', label: 'Patients', Icon: Users },
    { to: '/sessions/new', label: 'Record Session', Icon: Mic },
    {
      to: '/notes',
      label: 'Review queue',
      Icon: CheckSquare,
      badge: pendingReviewCount > 0 ? { kind: 'count', value: pendingReviewCount } : undefined,
    },
    { to: '/exercises', label: 'Exercise library', Icon: Dumbbell },
    { to: '/templates', label: 'Templates', Icon: ClipboardList },
  ];

  const initials = (clinician.name || 'PT')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside
      className={cn('grid h-full overflow-hidden', className)}
      style={{
        background: 'var(--color-pt-surface)',
        borderRight: '1px solid var(--color-pt-border)',
        gridTemplateRows: 'auto 1fr auto',
      }}
    >
      {/* Brand block */}
      <div style={{ padding: '20px 18px 14px' }}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--color-pt-accent)',
                color: '#ffffff',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              P
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-0.2px',
                color: 'var(--color-pt-text)',
              }}
            >
              PTScribe
            </div>
          </div>

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              aria-label="User profile"
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: 'none',
                background: profileOpen
                  ? 'var(--color-pt-accent-soft)'
                  : 'var(--color-pt-surface-mut)',
                color: profileOpen ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-3)',
                cursor: 'pointer',
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              {initials}
            </button>

            {profileOpen && (
              <div
                className="absolute z-50"
                style={{
                  top: '100%',
                  left: 0,
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
                <NavLink
                  to="/account"
                  onClick={() => {
                    setProfileOpen(false);
                    onClose?.();
                  }}
                  className="flex items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: 'var(--color-pt-text-2)',
                    textDecoration: 'none',
                  }}
                >
                  <UserCircle size={13} strokeWidth={1.75} />
                  <span>User settings</span>
                </NavLink>
                {DEBUG_TOOLS_ENABLED && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onClose?.();
                      openDebug();
                    }}
                    className="flex w-full items-center gap-2 transition-colors hover:bg-[var(--color-pt-surface-mut)]"
                    style={{
                      padding: '7px 12px',
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: 'var(--color-pt-text-2)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Terminal size={13} strokeWidth={1.75} />
                    <span>Debug Menu</span>
                  </button>
                )}
                <div style={{ height: 1, background: 'var(--color-pt-border)', margin: '2px 0' }} />
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onClose?.();
                    logout();
                  }}
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
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col" style={{ padding: '4px 10px', gap: 2, overflowY: 'auto' }}>
        {items.map((item) => (
          <NavItem key={item.to} {...item} onClose={onClose} />
        ))}
      </nav>

      {/* User block */}
      <div
        className="flex items-center gap-2.5"
        style={{
          padding: 14,
          borderTop: '1px solid var(--color-pt-border)',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: 'var(--color-pt-accent-soft)',
            color: 'var(--color-pt-accent-fg)',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-pt-text)' }}
          >
            {clinician.name || 'Clinician'}
          </div>
          <div className="truncate" style={{ fontSize: 11, color: 'var(--color-pt-text-3)' }}>
            {[clinician.credentials, clinician.practiceName].filter(Boolean).join(' · ') ||
              'PTScribe'}
          </div>
        </div>
        <NavLink
          to="/settings"
          aria-label="Settings"
          onClick={onClose}
          className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            color: 'var(--color-pt-text-3)',
          }}
        >
          <SettingsIcon size={15} strokeWidth={1.75} />
        </NavLink>
        <button
          type="button"
          aria-label="Log out"
          onClick={logout}
          className="flex items-center justify-center transition-colors hover:bg-[var(--color-pt-surface-mut)]"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--color-pt-text-3)',
            cursor: 'pointer',
          }}
        >
          <LogOut size={15} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  label,
  Icon,
  end,
  badge,
  onClose,
}: NavEntry & { badge?: Badge; onClose?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center transition-colors ${
          isActive ? '' : 'hover:bg-[var(--color-pt-surface-mut)]'
        }`
      }
      style={({ isActive }) => ({
        padding: '8px 10px',
        borderRadius: 8,
        gap: 10,
        fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-2)',
        background: isActive ? 'var(--color-pt-accent-soft)' : 'transparent',
      })}
    >
      <Icon size={16} strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {badge?.kind === 'live' && (
        <span
          style={{
            background: 'var(--color-pt-accent)',
            color: '#ffffff',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          LIVE
        </span>
      )}
      {badge?.kind === 'count' && (
        <span
          className="font-mono"
          style={{
            background: 'var(--color-pt-slate-soft)',
            color: 'var(--color-pt-text-2)',
            fontSize: 10.5,
            fontWeight: 600,
            padding: '1px 7px',
            borderRadius: 999,
            minWidth: 20,
            textAlign: 'center',
          }}
        >
          {badge.value}
        </span>
      )}
    </NavLink>
  );
}
