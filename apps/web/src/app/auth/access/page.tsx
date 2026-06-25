'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useIsInAppBrowser } from '@/lib/useIsInAppBrowser';
import { getOrCreateFunnelSessionId, trackInternalFunnelEvent } from '@/lib/funnel';
import { trackPixelCustomEvent, trackPixelEvent } from '@/lib/metaPixel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';
const RESEND_COOLDOWN = 60;

type Step = 'email' | 'code' | 'profile';

interface PendingAuth {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

function AccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, isAuthenticated, isHydrating, user } = useAuthStore();
  const isInAppBrowser = useIsInAppBrowser();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phoneDigits: '' });
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const eventId = searchParams.get('eventId') ?? undefined;
  const eventSlug = searchParams.get('eventSlug') ?? undefined;
  const eventName = searchParams.get('eventName') ?? undefined;
  const redirectUrl = searchParams.get('redirect') ?? undefined;
  const funnelSessionId = getOrCreateFunnelSessionId();

  // Redirect already-authenticated users
  useEffect(() => {
    if (!isHydrating && isAuthenticated && user) {
      const redirect = searchParams.get('redirect');
      const dest = redirect && redirect.startsWith('/') ? redirect : user.isAdmin || user.isOrganizer ? '/admin' : '/';
      router.replace(dest);
    }
  }, [isHydrating, isAuthenticated, user, router, searchParams]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otp.length === 6 && step === 'code') {
      handleVerifyCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const startResendTimer = useCallback(() => {
    setSecondsLeft(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const redirectAfterAuth = useCallback(
    (isAdmin: boolean, isOrganizer = false) => {
      const redirect = searchParams.get('redirect');
      const dest = redirect && redirect.startsWith('/') ? redirect : isAdmin || isOrganizer ? '/admin' : '/';
      router.replace(dest);
    },
    [searchParams, router],
  );

  // ── Step 1: Send OTP ────────────────────────────────────────────────────────
  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!validEmail) {
      toast.error('Please enter a valid email address.');
      void trackInternalFunnelEvent({
        eventId,
        email: normalizedEmail,
        step: 'otp_send_failed',
        status: 'failed',
        metadata: { reason: 'invalid_email', eventSlug, eventName },
      });
      return;
    }

    void trackInternalFunnelEvent({
      eventId,
      email: normalizedEmail,
      step: 'email_submitted',
      status: 'started',
      metadata: { eventSlug, eventName, returnUrl: redirectUrl ?? null },
    });

    trackPixelEvent('Lead', {
      content_name: eventName ?? eventSlug ?? 'Event Registration',
      content_category: 'ticket_registration',
      event_id: eventId ?? null,
    });
    trackPixelCustomEvent('OTP_Requested', {
      event_id: eventId ?? null,
      event_name: eventName ?? eventSlug ?? 'Unknown Event',
    });

    setLoading(true);
    try {
      // 15 s timeout — shorter than the global 30 s so users get a clear error
      // message rather than a blank loading screen if the API is slow/unreachable
      const res = await api.post<{ data: { userId: string } }>(
        '/auth/request-access',
        {
          email: normalizedEmail,
          eventId,
          eventSlug,
          eventName,
          sessionId: funnelSessionId,
          returnUrl: redirectUrl,
        },
        { timeout: 15_000 },
      );
      const { userId } = res.data.data;
      setPendingAuth({ userId, accessToken: '', refreshToken: '' });
      setStep('code');
      startResendTimer();
      setTimeout(() => otpInputRef.current?.focus(), 50);

      trackPixelCustomEvent('OTP_Sent', {
        event_id: eventId ?? null,
        event_name: eventName ?? eventSlug ?? 'Unknown Event',
      });
    } catch (err: any) {
      const isTimeout = err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK';
      const msg = err?.response?.data?.message ?? (isTimeout ? 'Request timed out. Please try again.' : 'Could not send code. Please try again.');
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);

      void trackInternalFunnelEvent({
        eventId,
        email: normalizedEmail,
        step: 'otp_send_failed',
        status: 'failed',
        metadata: {
          reason: Array.isArray(msg) ? msg.join(', ') : msg,
          networkError: !err?.response,
          eventSlug,
        },
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ──────────────────────────────────────────────────────
  async function handleVerifyCode() {
    if (!pendingAuth || otp.length !== 6) return;
    setLoading(true);
    try {
      const res = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isOrganizer?: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
          isNewUser: boolean;
        };
      }>(
        '/auth/verify-access',
        {
          userId: pendingAuth.userId,
          otp,
          eventId,
          eventSlug,
          eventName,
          sessionId: funnelSessionId,
          returnUrl: redirectUrl,
        },
      );

      const { user: verifiedUser, accessToken, refreshToken, isNewUser } = res.data.data;

      trackPixelEvent('CompleteRegistration', {
        content_name: eventName ?? eventSlug ?? 'Event Registration',
        status: true,
      });
      trackPixelCustomEvent('OTP_Verified', {
        event_id: eventId ?? null,
        event_name: eventName ?? eventSlug ?? 'Unknown Event',
      });

      if (isNewUser) {
        // Hold tokens in state — don't set global auth until profile is complete
        setPendingAuth({ userId: verifiedUser.id, accessToken, refreshToken });
        setStep('profile');
        void trackInternalFunnelEvent({
          eventId,
          email: verifiedUser.email,
          step: 'profile_started',
          status: 'started',
          metadata: { eventSlug, eventName, userId: verifiedUser.id },
        });
      } else {
        setAuth(
          {
            id: verifiedUser.id,
            email: verifiedUser.email,
            firstName: verifiedUser.firstName ?? '',
            lastName: verifiedUser.lastName ?? '',
            isAdmin: verifiedUser.isAdmin,
            isOrganizer: Boolean(verifiedUser.isOrganizer),
            isVerified: verifiedUser.isVerified,
          },
          accessToken,
          refreshToken,
        );
        toast.success(`Welcome back!`);
        redirectAfterAuth(verifiedUser.isAdmin, verifiedUser.isOrganizer);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Verification failed';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
      if (!err?.response) {
        void trackInternalFunnelEvent({
          eventId,
          email,
          step: 'otp_verification_failed',
          status: 'failed',
          metadata: { reason: 'network_error', eventSlug },
        });
      }
      setOtp('');
      otpInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── Resend code (re-uses request-access) ───────────────────────────────────
  async function handleResend() {
    if (secondsLeft > 0 || !pendingAuth) return;
    setLoading(true);
    try {
      await api.post('/auth/request-access', {
        email: email.trim().toLowerCase(),
        eventId,
        eventSlug,
        eventName,
        sessionId: funnelSessionId,
        returnUrl: redirectUrl,
      });
      setOtp('');
      startResendTimer();
      toast.success('A new code has been sent.');
      setTimeout(() => otpInputRef.current?.focus(), 50);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not resend code';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Complete profile ────────────────────────────────────────────────
  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAuth) return;
    setLoading(true);
    try {
      const phone = `+63${profile.phoneDigits}`;

      const res = await axios.patch<{
        data: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isOrganizer?: boolean; isVerified: boolean };
      }>(
        `${API_URL}/users/me`,
        { firstName: profile.firstName, lastName: profile.lastName, phone },
        { headers: { Authorization: `Bearer ${pendingAuth.accessToken}` } },
      );

      const updatedUser = res.data.data;

      void trackInternalFunnelEvent({
        eventId,
        email: updatedUser.email,
        step: 'profile_completed',
        status: 'success',
        metadata: { eventSlug, eventName, userId: updatedUser.id },
      });

      setAuth(
        {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          isAdmin: updatedUser.isAdmin,
          isOrganizer: Boolean(updatedUser.isOrganizer),
          isVerified: updatedUser.isVerified,
        },
        pendingAuth.accessToken,
        pendingAuth.refreshToken,
      );
      toast.success(`Welcome, ${updatedUser.firstName}!`);
      redirectAfterAuth(updatedUser.isAdmin, updatedUser.isOrganizer);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not save profile';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">
            Axon Tickets
          </Link>
          {step === 'email' && (
            <>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in</h1>
              <p className="mt-1 text-sm text-gray-500">
                Enter your email. No password needed.
              </p>
            </>
          )}
          {step === 'code' && (
            <>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Check your email</h1>
              <p className="mt-1 text-sm text-gray-500">
                We sent a 6-digit code to{' '}
                <span className="font-medium text-gray-700">{email}</span>
              </p>
            </>
          )}
          {step === 'profile' && (
            <>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Almost done!</h1>
              <p className="mt-1 text-sm text-gray-500">
                Tell us your name so we can put it on your ticket.
              </p>
            </>
          )}
        </div>

        {/* ── Step 1: Email ── */}
        {step === 'email' && (
          <form
            onSubmit={handleRequestAccess}
            className="bg-white shadow rounded-2xl p-8 space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <>
                  Send my code
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>

            <div className="space-y-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-xs text-gray-600">
              <p>We send a 6-digit code to your email. Enter the code to sign in.</p>
              <p>No password needed — ever.</p>
              <p>If the code does not arrive, check your spam or promotions folder.</p>
              {isInAppBrowser && (
                <p className="text-amber-700 font-medium">
                  Tip: Open this page in Safari or Chrome for the best experience.
                </p>
              )}
            </div>

          </form>
        )}

        {/* ── Step 2: OTP Code ── */}
        {step === 'code' && (
          <div className="bg-white shadow rounded-2xl p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3 text-center">
                Enter the 6-digit code
              </label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={loading}
                placeholder="000000"
                className="w-full text-center text-3xl font-mono tracking-[0.5em] rounded-xl border border-gray-300 px-4 py-4 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Verifying…
              </div>
            )}

            <div className="text-center space-y-1">
              {secondsLeft > 0 ? (
                <p className="text-xs text-gray-400">
                  Resend available in{' '}
                  <span className="font-medium tabular-nums">{secondsLeft}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
                >
                  Did not get the code? Send it again
                </button>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Use a different email address
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Complete profile ── */}
        {step === 'profile' && (
          <form
            onSubmit={handleCompleteProfile}
            className="bg-white shadow rounded-2xl p-8 space-y-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="given-name"
                  value={profile.firstName}
                  onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="family-name"
                  value={profile.lastName}
                  onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">
                  +63
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={profile.phoneDigits}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 10),
                    }))
                  }
                  placeholder="9171234567"
                  className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !profile.firstName || !profile.lastName || profile.phoneDigits.length < 10}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                'Continue'
              )}
            </button>
          </form>
        )}

        {step === 'email' && (
          <p className="mt-4 text-center text-xs text-gray-400">
            We&apos;ll email you a one-time code. No password required.
          </p>
        )}
      </div>
    </div>
  );
}

export default function AccessPage() {
  return (
    <Suspense>
      <AccessForm />
    </Suspense>
  );
}
