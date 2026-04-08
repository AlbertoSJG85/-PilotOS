import { AuthGuard } from '@/components/layout/auth-guard';

/**
 * Layout de la experiencia del conductor.
 * Mobile-first, sin sidebar. Pensado para instalarse como PWA.
 * El patrón nunca llega aquí — el middleware lo redirige a /admin.
 */
export default function ConductorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        {children}
      </div>
    </AuthGuard>
  );
}
