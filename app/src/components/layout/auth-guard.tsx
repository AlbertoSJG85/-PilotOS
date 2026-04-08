'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getSessionUser } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Si se especifica, solo permite ese tipo de usuario */
  requirePatron?: boolean;
}

export function AuthGuard({ children, requirePatron }: AuthGuardProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }

    if (requirePatron !== undefined) {
      const user = getSessionUser();
      if (requirePatron && !user?.es_patron) {
        router.replace('/conductor');
        return;
      }
    }

    setReady(true);
  }, [router, requirePatron]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
