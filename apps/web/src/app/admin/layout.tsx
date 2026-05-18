'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isHydrating } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // If there's no refresh token at all, redirect immediately — no hydration needed.
    if (!getRefreshToken()) {
      router.replace('/auth/login?redirect=/admin');
      return;
    }
    // While AuthHydrator is in-flight, do nothing. Once it completes
    // (isHydrating=false), enforce the admin check below.
  }, [router]);

  useEffect(() => {
    if (isHydrating) return;
    // Hydration is done (or never started because there was no token).
    // If still not authenticated at this point, send to login.
    if (!getRefreshToken()) return; // already handled above
    if (!isAuthenticated || !user?.isAdmin) {
      router.replace('/auth/login?redirect=/admin');
    }
  }, [isHydrating, isAuthenticated, user, router]);

  // Show spinner while we have a token but hydration is still in-flight,
  // or while we're waiting for the redirect to complete.
  if (isHydrating || !isAuthenticated || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
