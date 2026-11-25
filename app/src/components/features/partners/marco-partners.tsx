import Image from 'next/image';
import type { ReactNode } from 'react';

/** Marco de las pantallas de entrada de PilotOS Partners: la misma identidad que el login. */
export function MarcoPartners({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/branding/pilotos/logo-compact.png"
            alt="PilotOS"
            width={200}
            height={52}
            className="h-14 w-auto object-contain"
            priority
          />
          <p className="mt-3 rounded-full border border-pilotos-yellow/30 bg-pilotos-yellow/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-pilotos-yellow">
            Partners
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">{children}</div>
        {pie && <div className="mt-6 space-y-2 text-center text-xs text-zinc-500">{pie}</div>}
      </div>
    </div>
  );
}

export function AvisoError({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-800/50 bg-red-900/30 px-3 py-2 text-sm text-red-400">
      {texto}
    </p>
  );
}
