'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { getRefreshToken } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, isAuthenticated, isHydrating, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);
  const isStaff = Boolean(user?.isAdmin || user?.loginPortal === 'organizer');
  const dashboardLabel = user?.isAdmin ? 'Admin Dashboard' : 'Organizer Dashboard';

  // Close mobile menu and login dropdown on route change
  useEffect(() => {
    setIsMenuOpen(false);
    setIsLoginOpen(false);
  }, [pathname]);

  // Close login dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setIsLoginOpen(false);
      }
    }
    if (isLoginOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLoginOpen]);

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
      const refreshToken = getRefreshToken();
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // ignore
    } finally {
      logout();
      router.push('/');
    }
    toast.success('You have been signed out.');
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center shrink-0">
          <Image
            src="/axon-logo.svg"
            alt="Axon Tickets"
            width={148}
            height={30}
            priority
            unoptimized
          />
        </Link>

        {/* ── Desktop nav (hidden on mobile) ── */}
        <div className="hidden sm:flex items-center gap-4">
          {!isStaff && (
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
              {isStaff && (
                <Link
                  href="/admin"
                  className="group inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary transition-colors"
                  aria-label={
                    user?.isAdmin && pendingCount > 0
                      ? `Admin Dashboard — ${pendingCount} pending verification${pendingCount === 1 ? '' : 's'}`
                      : dashboardLabel
                  }
                >
                  <span>{dashboardLabel}</span>
                  {user?.isAdmin && pendingCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold leading-none bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 group-hover:bg-red-100 transition-colors"
                      title={`${pendingCount} pending verification${pendingCount === 1 ? '' : 's'}`}
                    >
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              )}
              {isStaff ? (
                <Link href="/admin/event-previews" className="text-sm font-medium text-gray-700 hover:text-primary">
                  Event Previews
                </Link>
              ) : (
                <Link href="/account/tickets" className="text-sm font-medium text-gray-700 hover:text-primary">
                  My Events
                </Link>
              )}
              <Link href={isStaff ? '/admin/profile' : '/profile'} className="text-sm font-medium text-gray-700 hover:text-primary">
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
              <Link href="/organizers" className="text-sm font-medium text-gray-500 hover:text-primary">
                For organizers
              </Link>
              <div className="w-px h-4 bg-gray-200" />
              {/* Log in dropdown */}
              <div ref={loginRef} className="relative">
                <button
                  onClick={() => setIsLoginOpen((prev) => !prev)}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-primary border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors"
                  aria-expanded={isLoginOpen}
                  aria-haspopup="true"
                >
                  Log in
                  <svg className={`w-3.5 h-3.5 transition-transform ${isLoginOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isLoginOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50">
                    <Link
                      href="/auth/login"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      <span>Customer login</span>
                    </Link>
                    <div className="my-1 border-t border-gray-100" />
                    <Link
                      href="/auth/organizer?redirect=/become-organizer"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                      </svg>
                      <div>
                        <span>Organizer login</span>
                        <span className="ml-2 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Organizer</span>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
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
              {!isStaff && (
                <Link href="/" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Home
                </Link>
              )}
              {isStaff && (
                <Link href="/admin" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <span>{dashboardLabel}</span>
                  {user?.isAdmin && pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              )}
              {isStaff ? (
                <Link href="/admin/event-previews" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Event Previews
                </Link>
              ) : (
                <Link href="/account/tickets" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  My Events
                </Link>
              )}
              <Link href={isStaff ? '/admin/profile' : '/profile'} className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
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
              <Link href="/organizers" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                For organizers
              </Link>
              <div className="my-1 border-t border-gray-100" />
              <p className="px-3 pt-1 pb-0.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide">Log in as</p>
              <Link href="/auth/login" className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Customer
              </Link>
              <Link href="/auth/organizer?redirect=/become-organizer" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <span>Organizer</span>
                <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Organizer</span>
              </Link>
              <div className="my-1 border-t border-gray-100" />
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
