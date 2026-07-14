'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken } from '@/lib/auth';
import AdminSidebar from '@/components/admin/AdminSidebar';

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center gap-3 px-4 bg-white border-b border-gray-200">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <Image src="/axon-logo.svg" alt="Axon Tickets" width={100} height={20} priority unoptimized />
      </div>

      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by mobile top bar height */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0">
        {children}
      </div>
    </div>
  );
}
