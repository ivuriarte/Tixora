'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, isAuthenticated, isHydrating, logout } = useAuthStore();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    if (!user?.isAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get('/admin/verifications/count');
        const body = res.data as { count?: number; data?: { count?: number } };
        const c = body?.data?.count ?? body?.count ?? 0;
        if (!cancelled) setPendingCount(c);
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.isAdmin]);

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      logout();
      router.push('/');
    }
    toast.success('Logged out');
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-primary">
          Axon Tickets
        </Link>

        <div className="flex items-center gap-4">
          {!user?.isAdmin && (
            <Link href="/" className="text-sm font-medium text-gray-700 hover:text-primary">
              Home
            </Link>
          )}
          {isHydrating ? (
            <div className="flex items-center gap-3">
              <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-18 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          ) : isAuthenticated ? (
            <>
              {user?.isAdmin && (
                <Link
                  href="/admin"
                  className="group inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary transition-colors"
                  aria-label={
                    pendingCount > 0
                      ? `Admin Dashboard — ${pendingCount} pending verification${pendingCount === 1 ? '' : 's'}`
                      : 'Admin Dashboard'
                  }
                >
                  <span>Admin Dashboard</span>
                  {pendingCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold leading-none bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 group-hover:bg-red-100 transition-colors"
                      title={`${pendingCount} pending verification${pendingCount === 1 ? '' : 's'}`}
                    >
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              )}
              {user?.isAdmin ? (
                <Link href="/admin/event-previews" className="text-sm font-medium text-gray-700 hover:text-primary">
                  Event Previews
                </Link>
              ) : (
                <Link href="/account/tickets" className="text-sm font-medium text-gray-700 hover:text-primary">
                  My Events
                </Link>
              )}
              <Link href="/profile" className="text-sm font-medium text-gray-700 hover:text-primary">
                My Profile
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm font-medium text-gray-700 hover:text-primary">
                Log in
              </Link>
              <Link
                href="/auth/register"
                className="text-sm font-semibold bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
