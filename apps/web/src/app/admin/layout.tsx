'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  // Track whether the auth hydration attempt has had time to settle.
  // AuthHydrator in providers.tsx fires once on mount; we wait one tick for
  // Zustand to update before deciding to redirect.
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If there's no refresh token at all, redirect immediately — no need to wait.
    if (!getRefreshToken()) {
      router.replace('/auth/login?redirect=/admin');
      return;
    }
    // Otherwise give AuthHydrator up to 1500 ms to rehydrate auth state.
    timerRef.current = setTimeout(() => setReady(true), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);

  // Once authenticated, mark ready immediately (don't wait for the full 1500 ms).
  useEffect(() => {
    if (isAuthenticated) setReady(true);
  }, [isAuthenticated]);

  // After ready: enforce admin check.
  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || !user?.isAdmin) {
      router.replace('/auth/login?redirect=/admin');
    }
  }, [ready, isAuthenticated, user, router]);

  if (!ready || !isAuthenticated || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
