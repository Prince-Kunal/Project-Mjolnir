import { NavLink, Outlet } from 'react-router-dom';
import { NAV } from '../lib/nav.ts';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'text-text' : 'text-muted hover:text-text';

export function AppShell() {
  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold tracking-tight">Mjolnir</div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={(s) =>
                `rounded-md px-2 py-1.5 text-sm ${linkClass(s)} ${s.isActive ? 'bg-surface-2' : ''}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 pt-6 pb-24 md:px-8 md:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={(s) => `py-3 text-center text-xs font-medium ${linkClass(s)}`}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
