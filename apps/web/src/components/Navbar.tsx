'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();

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
          {isAuthenticated ? (
            <>
              <Link href="/account/tickets" className="text-sm font-medium text-gray-700 hover:text-primary">
                My Tickets
              </Link>
              {user?.isAdmin && (
                <Link href="/admin" className="text-sm font-medium text-gray-700 hover:text-primary">
                  Admin
                </Link>
              )}
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
