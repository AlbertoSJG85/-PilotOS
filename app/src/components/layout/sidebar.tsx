'use client';

import Link from 'next/link';
import Image from 'next/image';
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
  X,
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
  { label: 'Panel',          href: '/admin',          icon: LayoutDashboard },
  { label: 'Partes',         href: '/partes',         icon: FileText },
  { label: 'Flota',          href: '/flota',          icon: Car },
  { label: 'Gastos',         href: '/gastos',         icon: Wallet },
  { label: 'Mantenimientos', href: '/mantenimientos', icon: Wrench },
  { label: 'Documentos',     href: '/documentos',     icon: FolderOpen },
  { label: 'Informes',       href: '/informes',       icon: PieChart },
];

const driverNav: NavItem[] = [
  { label: 'Mi Panel',    href: '/driver',  icon: LayoutDashboard },
  { label: 'Nuevo Parte', href: '/partes',  icon: FileText },
];

interface SidebarProps {
  /** Visible en mobile (drawer abierto) */
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const user = getSessionUser();
  const isPatron = user?.es_patron ?? false;
  const navItems = isPatron ? patronNav : driverNav;

  function handleLogout() {
    clearSession();
    window.location.href = '/login';
  }

  function handleNavClick() {
    onClose?.();
  }

  return (
    <>
      {/* ── Overlay backdrop (solo mobile) ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={cn(
          /* base */
          'flex h-screen w-64 flex-col bg-zinc-900 border-r border-zinc-800',
          /* desktop: always visible, static */
          'md:relative md:flex md:translate-x-0 md:z-auto',
          /* mobile: fixed, fuera de pantalla por defecto */
          'fixed left-0 top-0 z-50 transition-transform duration-200 ease-out md:transition-none',
          mobileOpen ? 'translate-x-0 animate-slide-in-left' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* ── Brand / Logo ── */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
          <Link href={isPatron ? '/admin' : '/conductor'} onClick={handleNavClick}>
            <Image
              src="/branding/pilotos/logo-compact.png"
              alt="PilotOS"
              width={140}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>
          {/* Botón cerrar — solo mobile */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Navegación ── */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-pilot-lime/10 text-pilot-lime'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? 'text-pilot-lime' : 'text-zinc-500',
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* ── User footer ── */}
        <div className="shrink-0 border-t border-zinc-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            {/* Avatar inicial */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pilot-lime/15 text-pilot-lime text-sm font-bold select-none">
              {(user?.nombre || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">
                {user?.nombre || 'Usuario'}
              </p>
              <p className="text-xs text-zinc-500">
                {isPatron ? 'Propietario' : 'Conductor'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
              aria-label="Cerrar sesion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
