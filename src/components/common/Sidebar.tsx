import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Mic,
  FileText,
  ClipboardList,
  Dumbbell,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';

interface NavEntry {
  to: string;
  label: string;
  Icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavEntry[];
}

const PRIMARY: NavSection[] = [
  {
    label: 'Today',
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/sessions/new', label: 'New session', Icon: Mic },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/patients', label: 'Patients', Icon: Users },
      { to: '/notes', label: 'Notes', Icon: FileText },
    ],
  },
  {
    label: 'Library',
    items: [
      { to: '/templates', label: 'Templates', Icon: ClipboardList },
      { to: '/exercises', label: 'Exercises', Icon: Dumbbell },
    ],
  },
];

const FOOTER: NavEntry[] = [{ to: '/settings', label: 'Settings', Icon: SettingsIcon }];

export function Sidebar() {
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r md:flex"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border-soft)',
      }}
    >
      <div className="px-5 pt-5 pb-6">
        <div
          className="font-display text-lg leading-none tracking-tight"
          style={{ color: 'var(--color-fg)' }}
        >
          PT <span style={{ color: 'var(--color-accent-deep)' }}>Notes</span>
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Local-first clinical scribe
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-5 px-3">
        {PRIMARY.map((section) => (
          <NavGroup key={section.label} section={section} />
        ))}
        <div
          className="mt-auto border-t pt-4 pb-4"
          style={{ borderColor: 'var(--color-border-soft)' }}
        >
          <div className="flex flex-col gap-0.5">
            {FOOTER.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </div>
      </nav>
    </aside>
  );
}

function NavGroup({ section }: { section: NavSection }) {
  return (
    <div>
      <div
        className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: 'var(--color-fg-subtle)' }}
      >
        {section.label}
      </div>
      <div className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>
    </div>
  );
}

function NavItem({ to, label, Icon }: NavEntry) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className="group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 hover:bg-[var(--color-surface-2)] aria-[current=page]:bg-[var(--color-accent-soft)] aria-[current=page]:text-[var(--color-accent-fg)] aria-[current=page]:font-medium"
      style={{ color: 'var(--color-fg-muted)' }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-150 group-aria-[current=page]:opacity-100"
        style={{ background: 'var(--color-accent)' }}
      />
      <Icon
        size={15}
        strokeWidth={1.75}
        className="text-[var(--color-fg-subtle)] group-aria-[current=page]:text-[var(--color-accent-deep)]"
      />
      <span>{label}</span>
    </NavLink>
  );
}
