'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Car,
  Wallet,
  Wrench,
  FolderOpen,
  PieChart,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearSession, getSessionUser } from '@/lib/auth';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const patronNav: NavItem[] = [
  { label: 'Panel', href: '/admin', icon: LayoutDashboard },
  { label: 'Partes', href: '/partes', icon: FileText },
  { label: 'Flota', href: '/flota', icon: Car },
  { label: 'Gastos', href: '/gastos', icon: Wallet },
  { label: 'Mantenimientos', href: '/mantenimientos', icon: Wrench },
  { label: 'Documentos', href: '/documentos', icon: FolderOpen },
  { label: 'Informes', href: '/informes', icon: PieChart },
];

const driverNav: NavItem[] = [
  { label: 'Mi Panel', href: '/driver', icon: LayoutDashboard },
  { label: 'Nuevo Parte', href: '/partes', icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = getSessionUser();
  const isPatron = user?.es_patron ?? false;
  const navItems = isPatron ? patronNav : driverNav;

  function handleLogout() {
    clearSession();
    window.location.href = '/login';
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-6">
      {/* Brand */}
      <div className="mb-8 px-3">
        <h1 className="text-lg font-bold text-zinc-100">
          Pilot<span className="text-amber-500">OS</span>
        </h1>
        <p className="text-[10px] tracking-widest text-zinc-600">by NexOS</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between px-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-200">{user?.nombre || 'Usuario'}</p>
            <p className="text-xs text-zinc-500">{isPatron ? 'Propietario' : 'Conductor'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Cerrar sesion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
