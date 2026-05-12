import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  Users,
  Mic,
  FileText,
  ClipboardList,
  Dumbbell,
  Settings as SettingsIcon,
  Search,
  User,
  type LucideIcon,
} from 'lucide-react';
import { duration, ease } from '@/lib/motion';
import { usePatients } from '@/contexts/PatientsProvider';

interface NavItem {
  to: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', hint: "Today's sessions", Icon: LayoutDashboard },
  { to: '/sessions/new', label: 'New session', hint: 'Record a visit', Icon: Mic },
  { to: '/patients', label: 'Patients', Icon: Users },
  { to: '/notes', label: 'Notes', Icon: FileText },
  { to: '/templates', label: 'Templates', Icon: ClipboardList },
  { to: '/exercises', label: 'Exercises', Icon: Dumbbell },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { patients } = usePatients();
  const activePatients = patients
    .filter((p) => p.status !== 'discharged')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (to: string) => {
    navigate(to);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-[var(--color-surface-2)] md:flex"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-fg-muted)',
        }}
      >
        <Search size={14} strokeWidth={1.75} />
        <span>Search…</span>
        <kbd
          className="ml-2 rounded border px-1.5 py-0.5 text-[10px]"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-fg-subtle)',
            background: 'var(--color-surface-2)',
          }}
        >
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0"
              style={{ background: 'oklch(0.28 0.03 250 / 0.32)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.quick, ease: ease.standard }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-label="Command palette"
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                boxShadow: 'var(--shadow-lg)',
              }}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: duration.base, ease: ease.enter }}
            >
              <Command label="Command palette" loop>
                <div
                  className="flex items-center gap-2 border-b px-4 py-3"
                  style={{ borderColor: 'var(--color-border-soft)' }}
                >
                  <Search size={16} style={{ color: 'var(--color-fg-subtle)' }} />
                  <Command.Input
                    autoFocus
                    placeholder="Jump to a page or action…"
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: 'var(--color-fg)' }}
                  />
                </div>
                <Command.List className="max-h-80 overflow-y-auto p-2">
                  <Command.Empty
                    className="px-3 py-8 text-center text-sm"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    No matches.
                  </Command.Empty>
                  <Command.Group
                    heading="Pages"
                    className="text-xs"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {ITEMS.map(({ to, label, hint, Icon }) => (
                      <Command.Item
                        key={to}
                        value={`${label} ${hint ?? ''}`}
                        onSelect={() => go(to)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-[var(--color-accent-soft)] aria-selected:text-[var(--color-accent-fg)]"
                        style={{ color: 'var(--color-fg)' }}
                      >
                        <Icon size={16} strokeWidth={1.75} />
                        <span className="flex-1">{label}</span>
                        {hint && (
                          <span className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
                            {hint}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>

                  {activePatients.length > 0 && (
                    <Command.Group
                      heading="Patients"
                      className="mt-2 text-xs"
                      style={{ color: 'var(--color-fg-subtle)' }}
                    >
                      {activePatients.map((p) => (
                        <Command.Item
                          key={p.id}
                          value={`patient ${p.firstName} ${p.lastName} ${p.mrn ?? ''} ${p.primaryDiagnosis ?? ''}`}
                          onSelect={() => go(`/patients/${p.id}`)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-[var(--color-accent-soft)] aria-selected:text-[var(--color-accent-fg)]"
                          style={{ color: 'var(--color-fg)' }}
                        >
                          <User size={16} strokeWidth={1.75} />
                          <span className="flex-1 truncate">
                            {p.lastName}, {p.firstName}
                          </span>
                          {p.primaryDiagnosis && (
                            <span
                              className="truncate text-xs"
                              style={{ color: 'var(--color-fg-subtle)' }}
                            >
                              {p.primaryDiagnosis}
                            </span>
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </Command.List>
              </Command>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
