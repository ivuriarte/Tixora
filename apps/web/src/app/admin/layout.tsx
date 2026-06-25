'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken } from '@/lib/auth';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isHydrating } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // If there's no refresh token at all, redirect immediately — no hydration needed.
    if (!getRefreshToken()) {
      router.replace('/auth/admin');
      return;
    }
    // While AuthHydrator is in-flight, do nothing. Once it completes
    // (isHydrating=false), enforce the admin check below.
  }, [router]);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated || (!user?.isAdmin && !user?.isOrganizer)) {
      router.replace('/auth/admin');
    }
  }, [isHydrating, isAuthenticated, user, router]);

  // Show spinner while we have a token but hydration is still in-flight,
  // or while we're waiting for the redirect to complete.
  if (isHydrating || !isAuthenticated || (!user?.isAdmin && !user?.isOrganizer)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
