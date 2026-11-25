import { AuthGuard } from '@/components/layout/auth-guard';
import { AccesoPilotOS, AvisoPrueba } from '@/components/features/acceso-pilotos';

/**
 * Layout de la experiencia del conductor.
 * Mobile-first, sin sidebar. Pensado para instalarse como PWA.
 */
export default function ConductorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AccesoPilotOS>
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <AvisoPrueba className="mx-4 mt-4" />
          {children}
        </div>
      </AccesoPilotOS>
    </AuthGuard>
  );
}
