import { AuthGuard } from '@/components/layout/auth-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardShell>
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}
