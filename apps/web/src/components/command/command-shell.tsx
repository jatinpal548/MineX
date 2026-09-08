'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Menu, X, Search, Bell } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RefreshButton } from '@/components/ui/refresh-button';
import { PRIMARY_NAV, UTILITY_NAV, filterNav, isActive } from './nav';

interface ShellUser {
  name: string;
  email: string;
  roleLabel: string;
}

interface ShellContext {
  scopeLabel: string;
  scopeKicker: string;
  user: ShellUser;
  permissions: string[];
}

const COLLAPSE_KEY = 'cg.command.sidebar.collapsed';

export function CommandShell({
  context,
  children,
}: {
  context: ShellContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const primaryNav = filterNav(PRIMARY_NAV, context.permissions);
  const utilityNav = filterNav(UTILITY_NAV, context.permissions);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* mobile drawer backdrop */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-graphite-950/50 md:hidden"
        />
      ) : null}

      <Sidebar
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        pathname={pathname}
        primaryNav={primaryNav}
        utilityNav={utilityNav}
        onToggleCollapse={toggleCollapse}
        onCloseDrawer={() => setDrawerOpen(false)}
      />

      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200',
          collapsed ? 'md:pl-16' : 'md:pl-60',
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" strokeWidth={2} />
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{context.scopeLabel}</p>
            <p className="truncate text-xs text-secondary">{context.scopeKicker}</p>
          </div>

          <form action="/inspections" className="relative ml-auto hidden lg:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary"
              strokeWidth={1.75}
            />
            <input
              name="q"
              placeholder="Search inspections…"
              className="h-9 w-56 rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-graphite-400"
            />
          </form>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <RefreshButton />
            <Link
              href="/notifications"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary transition-colors hover:bg-surface-muted"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex">
              <div className="text-right">
                <p className="text-sm font-medium leading-tight text-primary">
                  {context.user.name}
                </p>
                <p className="text-xs leading-tight text-secondary">{context.user.roleLabel}</p>
              </div>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-md px-2 py-1 text-xs text-secondary transition-colors hover:text-primary"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  collapsed,
  drawerOpen,
  pathname,
  primaryNav,
  utilityNav,
  onToggleCollapse,
  onCloseDrawer,
}: {
  collapsed: boolean;
  drawerOpen: boolean;
  pathname: string;
  primaryNav: typeof PRIMARY_NAV;
  utilityNav: typeof UTILITY_NAV;
  onToggleCollapse: () => void;
  onCloseDrawer: () => void;
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-graphite-950 text-paper-100 transition-transform duration-200',
        collapsed ? 'md:w-16' : 'md:w-60',
        'w-60',
        drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-graphite-800 px-4">
        <span className="inline-block h-7 w-7 shrink-0 whitespace-nowrap rounded-md bg-white text-center text-[12px] font-bold leading-7 text-graphite-900">
          M<span className="text-[#2563eb]">X</span>
        </span>
        {!collapsed ? (
          <span className="truncate whitespace-nowrap text-sm font-semibold tracking-tight">
            Mine<span className="text-[#2563eb]">X</span>{' '}
            <span className="text-graphite-400">Command</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={onCloseDrawer}
          className="ml-auto text-graphite-400 hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}
      </nav>

      <div className="space-y-1 border-t border-graphite-800 px-2 py-3">
        {utilityNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-graphite-400 transition-colors hover:bg-graphite-800 hover:text-white md:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: (typeof PRIMARY_NAV)[number];
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-graphite-800 text-white'
          : 'text-graphite-300 hover:bg-graphite-800/70 hover:text-white',
        collapsed && 'md:justify-center md:px-0',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className={cn(collapsed && 'md:hidden')}>{item.label}</span>
    </Link>
  );
}
