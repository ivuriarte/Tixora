'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import Button from '@/components/Button';
import { useIsInAppBrowser } from '@/lib/useIsInAppBrowser';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, isAuthenticated, isHydrating, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const isInAppBrowser = useIsInAppBrowser();

  // Redirect already-authenticated users away from the login page
  useEffect(() => {
    if (!isHydrating && isAuthenticated && user) {
      router.replace(user.isAdmin ? '/admin' : '/');
    }
  }, [isHydrating, isAuthenticated, user, router]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{
        data: { user: any; accessToken: string; refreshToken: string };
      }>('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      toast.success(`Welcome back, ${user.firstName}!`);
      const redirect = searchParams.get('redirect');
      // Only allow relative redirects to prevent open-redirect attacks
      const dest = redirect && redirect.startsWith('/') ? redirect : '/';
      router.replace(user.isAdmin ? '/admin' : dest);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Login failed';
      // If account not verified, redirect to verify page
      if (err?.response?.status === 403) {
        toast.error('Please verify your email first.');
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">Axon Tickets</Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Log in to your account</p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="bg-white shadow rounded-2xl p-8 space-y-5">
          {/* Honeypot: Chrome fills this instead of the real fields */}
          <input type="text" name="username_fake" autoComplete="username" aria-hidden="true" className="hidden" tabIndex={-1} readOnly />
          <input type="password" name="password_fake" autoComplete="current-password" aria-hidden="true" className="hidden" tabIndex={-1} readOnly />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="text"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-9 0-1.657.403-3.22 1.125-4.575M6.7 6.7A9.956 9.956 0 0112 5c5 0 9 4 9 9 0 1.657-.403 3.22-1.125 4.575M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.37 1.144-.958 2.206-1.72 3.104M15.54 15.54A5.978 5.978 0 0112 17c-3.314 0-6-2.686-6-6 0-.795.155-1.552.44-2.24" /></svg>
                )}
              </button>
            </div>
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Log in
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-gray-400">or</span>
            </div>
          </div>

          {isInAppBrowser ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Google sign-in isn&apos;t available here</p>
                <p className="mt-1 text-xs text-amber-700">
                  You&apos;re using an in-app browser (e.g. Messenger, Instagram). Please use email &amp; password above, or{' '}
                  <strong>open this page in Chrome or Safari</strong> to use Google.
                </p>
              </div>
            </div>
          ) : (
            <a
              href={`${(process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1')}/auth/google`}
              className="flex items-center justify-center gap-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </a>
          )}

          <p className="text-center text-sm text-gray-500">
            No account?{' '}
            <Link href="/auth/register" className="text-primary font-medium hover:underline">
              Sign up free
            </Link>
          </p>
        </form>
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
