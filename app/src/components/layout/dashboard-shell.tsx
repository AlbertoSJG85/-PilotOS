'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* ── Sidebar (desktop: static | mobile: drawer) ── */}
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image
            src="/branding/pilotos/logo-compact.png"
            alt="PilotOS"
            width={130}
            height={34}
            className="h-8 w-auto object-contain"
            priority
          />
          {/* Spacer para centrar el logo */}
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
