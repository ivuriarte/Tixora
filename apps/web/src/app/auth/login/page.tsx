'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isHydrating, user } = useAuthStore();

  useEffect(() => {
    if (!isHydrating && isAuthenticated && user) {
      router.replace(user.isAdmin ? '/admin' : '/');
    }
  }, [isHydrating, isAuthenticated, user, router]);

  const redirect = searchParams.get('redirect');
  const accessHref =
    '/auth/access' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : '');

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <Link
        href="/"
        className="absolute top-5 left-5 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to homepage
      </Link>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">
            Axon Tickets
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="bg-white shadow rounded-2xl p-8 space-y-4">
          {/* Email (OTP) — primary */}
          <Link
            href={accessHref}
            className="flex items-center justify-center gap-3 w-full rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Continue with email
          </Link>

          <p className="text-center text-sm text-gray-500 pt-1">
            No account?{' '}
            <Link href={accessHref} className="text-primary font-medium hover:underline">
              Join free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
