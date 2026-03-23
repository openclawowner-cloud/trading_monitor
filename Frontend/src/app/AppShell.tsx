import { NavLink, Outlet } from 'react-router-dom';

function navClassName(isActive: boolean): string {
  return [
    'px-3 py-1.5 rounded-md text-sm transition-colors border',
    isActive
      ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-zinc-100 hover:border-zinc-500'
  ].join(' ');
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
          <NavLink to="/" end className={({ isActive }) => navClassName(isActive)}>
            Home
          </NavLink>
          <NavLink to="/woox" className={({ isActive }) => navClassName(isActive)}>
            WOO
          </NavLink>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
