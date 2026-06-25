'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

const RESEND_COOLDOWN = 60;

type Step = 'email' | 'otp' | 'profile';

interface PendingAuth {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

function OrganizerSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, isAuthenticated, isHydrating, user } = useAuthStore();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phoneDigits: '' });
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const redirect = searchParams.get('redirect') ?? '/become-organizer';

  // Redirect already-authenticated non-admin users
  useEffect(() => {
    if (!isHydrating && isAuthenticated && user && !user.isAdmin) {
      router.replace(redirect.startsWith('/') ? redirect : '/become-organizer');
    }
  }, [isHydrating, isAuthenticated, user, router, redirect]);

  useEffect(() => { emailRef.current?.focus(); }, []);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && step === 'otp') {
      void handleVerifyOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startResendTimer = useCallback(() => {
    setSecondsLeft(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ data: { userId: string } }>(
        '/auth/request-access',
        { email: normalizedEmail },
        { timeout: 15_000 },
      );
      setPendingAuth({ userId: res.data.data.userId, accessToken: '', refreshToken: '' });
      setStep('otp');
      startResendTimer();
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message ?? (err.code === 'ECONNABORTED' ? 'Request timed out.' : 'Could not send code.')
        : 'Could not send code.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (!pendingAuth || otp.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isOrganizer?: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
          isNewUser: boolean;
        };
      }>('/auth/verify-access', { userId: pendingAuth.userId, otp });

      const { user: verifiedUser, accessToken, refreshToken, isNewUser } = res.data.data;

      if (verifiedUser.isAdmin) {
        setError('Admin accounts must sign in at /auth/admin.');
        setOtp('');
        setLoading(false);
        return;
      }

      if (isNewUser) {
        setPendingAuth({ userId: verifiedUser.id, accessToken, refreshToken });
        setStep('profile');
      } else {
        setAuth(
          {
            id: verifiedUser.id,
            email: verifiedUser.email,
            firstName: verifiedUser.firstName ?? '',
            lastName: verifiedUser.lastName ?? '',
            isAdmin: false,
            isOrganizer: verifiedUser.isOrganizer,
            isVerified: verifiedUser.isVerified,
          },
          accessToken,
          refreshToken,
        );
        toast.success('Welcome back!');
        router.replace(verifiedUser.isOrganizer ? '/admin' : redirect.startsWith('/') ? redirect : '/become-organizer');
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message ?? 'Verification failed.' : 'Verification failed.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
      setOtp('');
      otpRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (secondsLeft > 0 || !pendingAuth) return;
    setLoading(true);
    try {
      await api.post('/auth/request-access', { email: email.trim().toLowerCase() });
      setOtp('');
      startResendTimer();
      toast.success('A new code has been sent.');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch {
      toast.error('Could not resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAuth) return;
    setError('');
    setLoading(true);
    try {
      const phone = `+63${profile.phoneDigits}`;
      const res = await axios.patch<{
        data: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isVerified: boolean };
      }>(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.axontickets.online/api/v1'}/users/me`,
        { firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), phone },
        { headers: { Authorization: `Bearer ${pendingAuth.accessToken}` } },
      );
      const updatedUser = res.data.data;
      setAuth(
        { id: updatedUser.id, email: updatedUser.email, firstName: updatedUser.firstName, lastName: updatedUser.lastName, isAdmin: false, isVerified: updatedUser.isVerified },
        pendingAuth.accessToken,
        pendingAuth.refreshToken,
      );
      toast.success(`Welcome, ${updatedUser.firstName}!`);
      router.replace(redirect.startsWith('/') ? redirect : '/become-organizer');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message ?? 'Could not save profile.' : 'Could not save profile.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  }

  if (isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">Axon Tickets</Link>
          {step === 'email' && (
            <>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Organizer sign-in</h1>
              <p className="mt-1 text-sm text-gray-500">Sign in to your organizer account</p>
            </>
          )}
          {step === 'otp' && (
            <>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Check your email</h1>
              <p className="mt-1 text-sm text-gray-500">
                We sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>
              </p>
            </>
          )}
          {step === 'profile' && (
            <>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Almost done</h1>
              <p className="mt-1 text-sm text-gray-500">Tell us your name to complete your account.</p>
            </>
          )}
        </div>

        <div className="bg-white shadow rounded-2xl p-8">

          {/* Error banner */}
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-5">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={handleRequestOTP} noValidate className="space-y-5">
              <div>
                <label htmlFor="org-signin-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  ref={emailRef}
                  id="org-signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  disabled={loading}
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    Send sign-in code
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center">
                We&apos;ll email you a one-time code. No password required.
              </p>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3 text-center">
                  Enter the 6-digit code
                </label>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  disabled={loading}
                  placeholder="000000"
                  className="w-full text-center text-3xl font-mono tracking-[0.5em] rounded-xl border border-gray-300 px-4 py-4 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  Verifying…
                </div>
              )}
              <div className="text-center space-y-2">
                {secondsLeft > 0 ? (
                  <p className="text-xs text-gray-400">
                    Resend in <span className="font-medium tabular-nums">{secondsLeft}s</span>
                  </p>
                ) : (
                  <button type="button" onClick={handleResend} disabled={loading} className="text-xs text-primary font-medium hover:underline disabled:opacity-50">
                    Did not get the code? Resend
                  </button>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Profile (new users only) */}
          {step === 'profile' && (
            <form onSubmit={handleCompleteProfile} noValidate className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="org-signin-fn" className="block text-sm font-medium text-gray-700 mb-1">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="org-signin-fn"
                    type="text"
                    autoFocus
                    autoComplete="given-name"
                    required
                    value={profile.firstName}
                    onChange={(e) => { setProfile((p) => ({ ...p, firstName: e.target.value })); setError(''); }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="org-signin-ln" className="block text-sm font-medium text-gray-700 mb-1">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="org-signin-ln"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={profile.lastName}
                    onChange={(e) => { setProfile((p) => ({ ...p, lastName: e.target.value })); setError(''); }}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="org-signin-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile number <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">+63</span>
                  <input
                    id="org-signin-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={profile.phoneDigits}
                    onChange={(e) => setProfile((p) => ({ ...p, phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    placeholder="9171234567"
                    className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !profile.firstName.trim() || !profile.lastName.trim() || profile.phoneDigits.length < 10}
                className="w-full rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                ) : 'Complete account'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          <Link href="/become-organizer" className="hover:text-gray-600 transition-colors">
            ← Back to organizer program
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function OrganizerSignInPage() {
  return (
    <Suspense>
      <OrganizerSignInForm />
    </Suspense>
  );
}
