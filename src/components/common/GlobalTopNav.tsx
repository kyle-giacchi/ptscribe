import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [overflowOpen]);

  return (
    <header
      role="banner"
      className="flex items-center"
      style={{
        position: 'relative',
        background: 'var(--color-pt-surface)',
        borderBottom: '1px solid var(--color-pt-border)',
        padding: '0 16px',
        height: 52,
        gap: 16,
      }}
    >
      {/* Hamburger — visible below 1024px */}
      <button
        type="button"
        aria-label="Open primary nav"
        onClick={() => setOverflowOpen((o) => !o)}
        className="hidden items-center justify-center max-[1023px]:flex"
        style={{
          width: 36,
          height: 36,
          border: '1px solid var(--color-pt-border)',
          borderRadius: 8,
          background: 'var(--color-pt-surface)',
          cursor: 'pointer',
          color: 'var(--color-pt-text)',
          flexShrink: 0,
        }}
      >
        <Menu size={16} strokeWidth={2} />
      </button>

      {/* Overflow dropdown menu */}
      {overflowOpen && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'absolute',
            top: 54,
            left: 12,
            zIndex: 50,
            background: 'var(--color-pt-surface)',
            border: '1px solid var(--color-pt-border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(43,40,38,0.14)',
            minWidth: 180,
            padding: '6px 0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              role="menuitem"
              onClick={() => setOverflowOpen(false)}
              className={({ isActive }) => `nav-item-global ${isActive ? 'active' : ''}`}
              style={({ isActive }) => ({
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
                background: isActive ? 'var(--color-pt-accent-soft)' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
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
        </div>
      )}

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
        <div className="global-search-input">
          <GlobalSearch />
        </div>
        <VaultPill />
        <AlertsButton />
        <ProfileButton />
      </div>
    </header>
  );
}
