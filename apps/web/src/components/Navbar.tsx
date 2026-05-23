'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, isAuthenticated, isHydrating, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close mobile menu whenever the route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

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

        {/* ── Desktop nav (hidden on mobile) ── */}
        <div className="hidden sm:flex items-center gap-4">
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

        {/* ── Hamburger button (mobile only) ── */}
        <button
          className="sm:hidden flex items-center justify-center w-8 h-8 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile dropdown menu ── */}
      {isMenuOpen && (
        <div className="sm:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-1">
          {isHydrating ? (
            <div className="space-y-2 px-3 py-2">
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : isAuthenticated ? (
            <>
              {!user?.isAdmin && (
                <Link href="/" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Home
                </Link>
              )}
              {user?.isAdmin && (
                <Link href="/admin" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <span>Admin Dashboard</span>
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              )}
              {user?.isAdmin ? (
                <Link href="/admin/event-previews" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Event Previews
                </Link>
              ) : (
                <Link href="/account/tickets" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  My Events
                </Link>
              )}
              <Link href="/profile" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                My Profile
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Home
              </Link>
              <Link href="/auth/login" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Log in
              </Link>
              <Link
                href="/auth/register"
                className="block mt-1 px-3 py-2 rounded-lg text-sm font-semibold bg-primary text-white text-center hover:bg-primary-hover transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
