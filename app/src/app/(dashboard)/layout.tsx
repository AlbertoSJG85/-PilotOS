import { AuthGuard } from '@/components/layout/auth-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { AccesoPilotOS } from '@/components/features/acceso-pilotos';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AccesoPilotOS>
        <DashboardShell>
          {children}
        </DashboardShell>
      </AccesoPilotOS>
    </AuthGuard>
  );
}
