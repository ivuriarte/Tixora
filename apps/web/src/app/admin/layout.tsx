'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken } from '@/lib/auth';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { SkeletonBlock } from '@/components/Skeleton';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isHydrating } = useAuthStore();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hasAdminShellAccess = Boolean(user?.isAdmin || user?.isOrganizer);

  useEffect(() => {
    if (!getRefreshToken()) {
      router.replace('/auth/admin');
      return;
    }
  }, [router]);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated || !hasAdminShellAccess) {
      router.replace(getRefreshToken() && user?.loginPortal === 'organizer' ? '/become-organizer' : getRefreshToken() ? '/' : '/auth/admin');
    }
  }, [isHydrating, isAuthenticated, hasAdminShellAccess, user?.loginPortal, router]);

  if (isHydrating || !isAuthenticated || !hasAdminShellAccess) {
    return (
      <div className="min-h-screen bg-[#f5f0ff] p-4 sm:p-8" aria-label="Loading workspace" role="status">
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonBlock className="h-16 w-full" />
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
          </div>
          <SkeletonBlock className="h-80 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f5f0ff]">
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[#e4dcf4] bg-white px-4 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#6b5b8a] transition-colors hover:bg-[#ede9fe] hover:text-primary"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <Image src="/axon-tickets-logo.png" alt="Axon Tickets" width={112} height={32} priority />
      </div>

      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by mobile top bar height */}
      <div className="min-w-0 flex-1 pt-14 md:pt-0">
        {children}
      </div>
    </div>
  );
}
