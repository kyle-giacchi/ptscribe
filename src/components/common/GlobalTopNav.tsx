import { NavLink, useNavigate } from 'react-router-dom';
import { useNotes } from '@/contexts/NotesProvider';
import { AlertsButton, ProfileButton, VaultPill } from './TopBar';
import { GlobalSearch } from './GlobalSearch';

const NAV_ITEMS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/today', label: 'My Chart' },
  { to: '/notes', label: 'Review queue' },
  { to: '/patients', label: 'Patients' },
  { to: '/templates', label: 'Templates' },
  { to: '/settings', label: 'Settings' },
];

export function GlobalTopNav() {
  const { notes } = useNotes();
  const pendingCount = notes.filter((n) => !n.finalized).length;
  const navigate = useNavigate();

  return (
    <header
      role="banner"
      className="flex items-center"
      style={{
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '0 16px',
        height: 52,
        gap: 16,
      }}
    >
      {/* Brand */}
      <button
        type="button"
        onClick={() => navigate('/today')}
        aria-label="PTScribe home"
        className="flex items-center gap-2"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--color-pt-accent)',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          P
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-pt-text)' }}>
          PTScribe
        </span>
      </button>

      <div style={{ width: 1, height: 22, background: 'var(--color-pt-border)' }} aria-hidden />

      {/* Primary nav */}
      <nav className="flex items-center" style={{ gap: 4 }} aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item-global ${isActive ? 'active' : ''}`}
            style={({ isActive }) => ({
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text-3)',
              background: isActive ? 'var(--color-pt-accent-soft)' : 'transparent',
              border: isActive
                ? '1px solid var(--color-pt-accent-border)'
                : '1px solid transparent',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            })}
          >
            <span>{item.label}</span>
            {item.to === '/notes' && pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending`}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  minWidth: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: 'var(--color-pt-accent)',
                  color: '#fff',
                  lineHeight: '15px',
                  textAlign: 'center',
                }}
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Right cluster */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <GlobalSearch />
        <VaultPill />
        <AlertsButton />
        <ProfileButton />
      </div>
    </header>
  );
}
