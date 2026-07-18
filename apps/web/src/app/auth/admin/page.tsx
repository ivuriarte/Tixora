'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { SkeletonBlock } from '@/components/Skeleton';

export default function AdminAuthPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, user, setAuth } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);

  // If already authenticated as admin, go straight to /admin
  useEffect(() => {
    if (!isHydrating && isAuthenticated && user?.isAdmin) {
      router.replace('/admin');
    }
  }, [isHydrating, isAuthenticated, user, router]);

  // Focus email on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post<{
        data: {
          user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            isAdmin: boolean;
            isVerified: boolean;
          };
          accessToken: string;
          refreshToken: string;
        };
      }>('/auth/login', { email: email.trim().toLowerCase(), password });

      const { user: loggedInUser, accessToken, refreshToken } = data.data;

      if (!loggedInUser.isAdmin) {
        setError('This account does not have admin access.');
        setLoading(false);
        return;
      }

      setAuth(loggedInUser, accessToken, refreshToken);
      router.replace('/admin');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.message;
        if (err.response?.status === 429) {
          setError('Too many sign-in attempts. Please wait a moment and try again.');
        } else if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK' || !err.response) {
          setError('Unable to reach the server. Please try again.');
        } else {
          setError(
            (Array.isArray(message) ? message.join(', ') : message) ||
              'Invalid email or password.',
          );
        }
      } else {
        setError('Unable to sign in. Please try again.');
      }
      setLoading(false);
    }
  }

  // Show nothing while hydrating (avoids flash before redirect kicks in)
  if (isHydrating) {
    return (
      <div className="axon-auth-page" aria-label="Loading sign-in" role="status">
        <SkeletonBlock className="h-[420px] w-full max-w-sm" />
      </div>
    );
  }

  return (
    <div className="axon-auth-page">
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <div className="text-center mb-8">
          <Link href="/" className="axon-label inline-flex min-h-[44px] items-center text-sm text-primary">
            Axon Tickets
          </Link>
          <h1 className="axon-display mt-4 text-4xl">Admin sign-in</h1>
          <p className="mt-2 text-sm text-[#6b5b8a]">This page is for administrators only</p>
        </div>

        <div className="axon-auth-card">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Error banner */}
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400"
                disabled={loading}
                placeholder="admin@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400"
                  disabled={loading}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="axon-pill w-full gap-2 bg-primary text-sm text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Sign in to Admin Panel'
              )}
            </button>
          </form>
        </div>

        {/* Back link — low prominence */}
        <p className="mt-6 text-center text-sm text-gray-400">
          <Link href="/" className="hover:text-gray-600 transition-colors">
            ← Back to main site
          </Link>
        </p>

      </div>
    </div>
  );
}
