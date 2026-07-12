'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getAccessToken } from '@/lib/auth';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import RegistrationForm from '@/components/RegistrationForm';
import CheckoutStepper from '@/components/CheckoutStepper';
import InAppBrowserBanner from '@/components/InAppBrowserBanner';
import { trackPixelCustomEvent } from '@/lib/metaPixel';
import { trackInternalFunnelEvent, getOrCreateFunnelSessionId } from '@/lib/funnel';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';

// ── Types ────────────────────────────────────────────────────────────────────

interface Tier {
  id: string;
  name: string;
  price: number;
  inclusions?: Array<{ id?: string; label: string; stubEnabled?: boolean; sortOrder?: number }>;
  available: number;
  maxPerOrder: number;
}

interface PaymentMethod {
  name: string;
  type?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
}

interface EventData {
  id: string;
  slug: string;
  title: string;
  venue: string;
  startsAt: string;
  tiers: Tier[];
  isFree?: boolean;
  platformFee?: number;
  allowManualPayment?: boolean;
  paymentMethods?: PaymentMethod[] | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  paymentInstructions?: string | null;
}

interface AttendeeFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  birthday: string;
  gender: string;
  city: string;
}

type WizardStep = 'email' | 'verify' | 'details';

const RESEND_COOLDOWN = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── Guest Wizard (unauthenticated path) ──────────────────────────────────────

interface OtpVerifiedPayload {
  isExistingAccount: boolean;
  attendees: AttendeeFields[];
  notes: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isVerified: boolean };
  accessToken: string;
  refreshToken: string;
}

interface GuestWizardProps {
  event: EventData;
  tier: Tier;
  qty: number;
  existingRegistrationId?: string;
  onOtpVerified: (payload: OtpVerifiedPayload) => void;
}

function GuestWizard({ event, onOtpVerified }: GuestWizardProps) {
  const funnelSessionId = getOrCreateFunnelSessionId();

  // Step machine: email → verify → details (new users only)
  const [step, setStep] = useState<WizardStep>('email');

  // email step
  const [email, setEmail] = useState('');

  // verify step
  const [otp, setOtp] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const verifyingRef = useRef(false);

  // Stored after OTP verify — used in details step
  const [verifiedUser, setVerifiedUser] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isVerified: boolean } | null>(null);
  const [verifiedAccessToken, setVerifiedAccessToken] = useState('');
  const [verifiedRefreshToken, setVerifiedRefreshToken] = useState('');
  const [isExistingAccount, setIsExistingAccount] = useState(false);

  // details step (new users)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    if (otp.length === 6 && step === 'verify') void handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  function startResendTimer() {
    setSecondsLeft(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  // ── Step 1: Email only → send OTP ─────────────────────────────────────────

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFieldError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ data: { userId: string } }>(
        '/auth/request-access',
        { email: normalizedEmail, eventId: event.id, eventSlug: event.slug, eventName: event.title, sessionId: funnelSessionId },
        { timeout: 15_000 },
      );
      setPendingUserId(res.data.data.userId);
      setStep('verify');
      startResendTimer();
      setTimeout(() => otpInputRef.current?.focus(), 50);

      trackPixelCustomEvent('OTP_Requested', { event_id: event.id, event_name: event.title });
      void trackInternalFunnelEvent({
        eventId: event.id,
        email: normalizedEmail,
        step: 'otp_send_requested',
        status: 'started',
        metadata: { eventSlug: event.slug, eventTitle: event.title },
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not send your code. Please try again.';
      setFieldError(Array.isArray(msg) ? msg.join(' ') : msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────

  async function handleVerify() {
    if (!pendingUserId || otp.length !== 6) return;
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);
    setFieldError(null);
    try {
      const verifyRes = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
          isNewUser: boolean;
          isExistingAccount: boolean;
        };
      }>('/auth/verify-access', {
        userId: pendingUserId,
        otp,
        eventId: event.id,
        eventSlug: event.slug,
        sessionId: funnelSessionId,
      });

      const { user: verified, accessToken, refreshToken, isExistingAccount: existing } = verifyRes.data.data;

      trackPixelCustomEvent('OTP_Verified', { event_id: event.id, event_name: event.title });
      void trackInternalFunnelEvent({
        eventId: event.id,
        email: verified.email,
        step: 'otp_verified',
        status: 'success',
        metadata: { eventSlug: event.slug, isExistingAccount: existing },
      });

      if (verified.firstName) {
        // Returning user — profile already exists, hand off immediately
        onOtpVerified({
          isExistingAccount: existing,
          attendees: [{
            firstName: verified.firstName,
            lastName: verified.lastName ?? '',
            email: verified.email,
            phone: '',
            company: '',
            jobTitle: '',
            birthday: '',
            gender: '',
            city: '',
          }],
          notes: '',
          user: verified,
          accessToken,
          refreshToken,
        });
      } else {
        // New user — collect name + phone before handing off
        setVerifiedUser(verified);
        setVerifiedAccessToken(accessToken);
        setVerifiedRefreshToken(refreshToken);
        setIsExistingAccount(existing);
        setStep('details');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Something went wrong. Please try again.';
      setFieldError(Array.isArray(msg) ? msg.join(' ') : msg);
      setOtp('');
      otpInputRef.current?.focus();
      verifyingRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (secondsLeft > 0 || !pendingUserId) return;
    setLoading(true);
    try {
      await api.post('/auth/request-access', {
        email: email.trim().toLowerCase(),
        eventId: event.id,
        eventSlug: event.slug,
        sessionId: funnelSessionId,
      });
      setOtp('');
      startResendTimer();
      toast.success('A new code has been sent to your email.');
      setTimeout(() => otpInputRef.current?.focus(), 50);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not resend. Please wait and try again.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Name + phone for new users ───────────────────────────────────

  async function handleCompleteDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!verifiedUser) return;
    setFieldError(null);
    const normalizedPhone = `+63${phone.trim()}`;

    setDetailsLoading(true);
    try {
      await axios.patch(
        `${API_URL}/users/me`,
        { firstName: firstName.trim(), lastName: lastName.trim(), phone: normalizedPhone },
        { headers: { Authorization: `Bearer ${verifiedAccessToken}` } },
      );

      onOtpVerified({
        isExistingAccount,
        attendees: [{
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: verifiedUser.email,
          phone: normalizedPhone,
          company: '',
          jobTitle: '',
          birthday: '',
          gender: '',
          city: '',
        }],
        notes: '',
        user: { ...verifiedUser, firstName: firstName.trim(), lastName: lastName.trim() },
        accessToken: verifiedAccessToken,
        refreshToken: verifiedRefreshToken,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not save your details. Please try again.';
      setFieldError(Array.isArray(msg) ? msg.join(' ') : msg);
    } finally {
      setDetailsLoading(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white';

  // ── Render: Step 1 — Email ────────────────────────────────────────────────
  if (step === 'email') {
    return (
      <form onSubmit={handleSendEmail} className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Enter your email to continue</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              We&apos;ll send a 6-digit code to verify it&apos;s you. No password needed.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Your ticket and QR code will be sent here.
            </p>
          </div>
        </div>

        {fieldError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {fieldError}
          </div>
        )}

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500 space-y-1">
          <p>We&apos;ll send a 6-digit code to your email to verify your identity.</p>
          <p>No password needed — ever.</p>
        </div>

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <><Spinner /> Sending your code…</> : 'Send My Code'}
        </button>
      </form>
    );
  }

  // ── Render: Step 2 — OTP ─────────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Check your email</h2>
            <p className="text-sm text-gray-500 mt-1">
              We sent a 6-digit code to{' '}
              <span className="font-semibold text-gray-700">{email}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Check your inbox and spam folder. The code is valid for 5 minutes.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
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
              <Spinner /> Verifying your code…
            </div>
          )}

          {fieldError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
              {fieldError}
            </div>
          )}

          <div className="text-center space-y-2">
            {secondsLeft > 0 ? (
              <p className="text-xs text-gray-400">
                Send a new code in{' '}
                <span className="font-semibold tabular-nums">{secondsLeft}s</span>
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
                onClick={() => { setStep('email'); setOtp(''); setFieldError(null); verifyingRef.current = false; }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Use a different email
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Step 3 — Name + phone (new users only) ───────────────────────
  return (
    <form onSubmit={handleCompleteDetails} className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Almost there!</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tell us your name so we can address your ticket correctly.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              autoFocus
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Juan"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="dela Cruz"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Mobile Number <span className="text-red-500">*</span>
          </label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">
              +63
            </span>
            <input
              type="tel"
              required
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9171234567"
              className="flex-1 rounded-r-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white"
            />
          </div>
        </div>
      </div>

      {fieldError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {fieldError}
        </div>
      )}

      <button
        type="submit"
        disabled={detailsLoading || !firstName || !lastName || phone.length < 10}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {detailsLoading ? <><Spinner /> Saving…</> : 'Continue to Registration'}
      </button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RegisterPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: {
    tierId?: string;
    qty?: string;
    registrationId?: string;
    eventId?: string;
    eventSlug?: string;
    eventName?: string;
  };
}) {
  const router = useRouter();
  const { isAuthenticated, isHydrating, setAuth } = useAuthStore();

  const [event, setEvent] = useState<EventData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [initialAttendees, setInitialAttendees] = useState<AttendeeFields[] | undefined>(undefined);
  const [initialNotes, setInitialNotes] = useState<string | undefined>(undefined);
  const [initialIsFree, setInitialIsFree] = useState<boolean | undefined>(undefined);

  // 'idle' → 'checking' → 'duplicate' | 'clear'
  const [dupCheck, setDupCheck] = useState<'idle' | 'checking' | 'duplicate' | 'clear'>('idle');
  const dupCheckRanRef = useRef(false);

  // Holds attendee data collected by GuestWizard so RegistrationForm can pre-fill after OTP success.
  // Using a ref avoids a render ordering issue between Zustand (setAuth) and React state updates.
  const pendingGuestData = useRef<{
    attendees: AttendeeFields[];
    notes: string;
    existingAccountDetected: boolean;
  } | null>(null);

  const handleOtpVerified = useCallback(
    (payload: OtpVerifiedPayload) => {
      // Store wizard data first (ref is synchronous — available in the very next render)
      pendingGuestData.current = {
        attendees: payload.attendees,
        notes: payload.notes,
        existingAccountDetected: payload.isExistingAccount,
      };
      // Calling setAuth sets isAuthenticated=true in Zustand, which triggers a re-render
      // of this component and switches from GuestWizard to RegistrationForm.
      setAuth(
        {
          id: payload.user.id,
          email: payload.user.email,
          firstName: payload.user.firstName ?? payload.attendees[0]?.firstName ?? '',
          lastName: payload.user.lastName ?? payload.attendees[0]?.lastName ?? '',
          isAdmin: payload.user.isAdmin,
          isVerified: payload.user.isVerified,
        },
        payload.accessToken,
        payload.refreshToken,
      );
    },
    [setAuth],
  );

  const qty = Math.max(1, parseInt(searchParams.qty ?? '1', 10));
  const existingRegistrationId = searchParams.registrationId;

  const loadPage = useCallback(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';

    const eventFetch = fetch(`${baseUrl}/events/${params.slug}`)
      .then((r) => (r.ok ? r.json() : null));

    const regFetch =
      existingRegistrationId && getAccessToken()
        ? api
            .get(`/registrations/${existingRegistrationId}`)
            .then((r) => r.data?.data ?? r.data)
            .catch(() => null)
        : Promise.resolve(null);

    try {
      const [eventJson, regData] = await Promise.all([eventFetch, regFetch]);
      if (!eventJson) { router.replace(`/events/${params.slug}`); return; }
      setEvent(eventJson.data);

      if (regData?.attendees) {
        const sorted = [...regData.attendees].sort(
          (a: { isLead: boolean }, b: { isLead: boolean }) => (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0),
        );
        setInitialAttendees(
          sorted.map((a: { firstName: string; lastName: string; email: string; phone?: string | null; company?: string | null; jobTitle?: string | null; birthday?: string | null; gender?: string | null; city?: string | null }) => ({
            firstName: a.firstName,
            lastName: a.lastName,
            email: a.email,
            phone: a.phone ?? '',
            company: a.company ?? '',
            jobTitle: a.jobTitle ?? '',
            birthday: a.birthday?.slice(0, 10) ?? '',
            gender: a.gender ?? '',
            city: a.city ?? '',
          })),
        );
        setInitialNotes(regData.notes ?? '');
        setInitialIsFree(regData.isFree ?? false);
      }
    } catch {
      router.replace(`/events/${params.slug}`);
    } finally {
      setPageLoading(false);
    }
  }, [params.slug, existingRegistrationId, router]);

  useEffect(() => {
    // Wait for auth to hydrate so we know which path to render before loading
    if (!isHydrating) void loadPage();
  }, [isHydrating, loadPage]);

  // After authentication (either OTP path), check if this user already has an
  // active registration for this event. If so, redirect them to the event page
  // instead of showing the registration form. Skip when editing an existing
  // registration (existingRegistrationId is set).
  useEffect(() => {
    if (!isAuthenticated || !event || dupCheckRanRef.current || existingRegistrationId) return;
    dupCheckRanRef.current = true;
    setDupCheck('checking');
    api
      .get<{ data?: { hasRegistration: boolean }; hasRegistration?: boolean }>(
        `/registrations/check?eventId=${event.id}`,
      )
      .then((res) => {
        const hasReg = res.data?.data?.hasRegistration ?? res.data?.hasRegistration ?? false;
        if (hasReg) {
          setDupCheck('duplicate');
          setTimeout(() => router.replace(`/events/${event.slug}`), 3000);
        } else {
          setDupCheck('clear');
        }
      })
      .catch(() => {
        // Fail open — let them proceed; the server will reject on submit
        setDupCheck('clear');
      });
  }, [isAuthenticated, event, existingRegistrationId, router]);

  useEffect(() => {
    if (!event) return;
    trackPixelCustomEvent('TicketSelection_Started', { event_id: event.id, event_name: event.title },
      `ticket-selection:${event.id}:${searchParams.tierId ?? ''}:${searchParams.qty ?? '1'}`);
  }, [event, searchParams.tierId, searchParams.qty]);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (pageLoading || isHydrating || !event) {
    return (
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  const tierId = searchParams.tierId ?? event.tiers[0]?.id;
  const tier = event.tiers.find((t) => t.id === tierId);

  if (!tier) {
    router.replace(`/events/${event.slug}`);
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <InAppBrowserBanner />
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <CheckoutStepper current={1} />

        <div className="mb-6">
          <a href={`/events/${event.slug}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to event
          </a>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{event.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{event.venue}</p>
        </div>

        {/* Order summary strip */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium text-gray-900">{tier.name}</span>
            <span className="text-gray-500"> × {qty}</span>
          </div>
          <span className="text-sm font-semibold text-primary">
            {event.isFree || tier.price === 0 ? 'Free' : `₱${(tier.price * qty).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          </span>
        </div>
        {tier.inclusions && tier.inclusions.length > 0 && (
          <div className="mb-5 -mt-2 flex flex-wrap gap-1.5">
            {tier.inclusions.map((item) => (
              <span key={item.id ?? item.label} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {item.label}
              </span>
            ))}
          </div>
        )}

        {/* Path A: authenticated (or just verified via OTP) — RegistrationForm */}
        {isAuthenticated ? (
          // While checking for a duplicate registration, show a neutral loading state.
          // On duplicate, show an error banner and redirect after 3 s.
          dupCheck === 'duplicate' ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold text-red-900">You&apos;re already registered for this event</p>
                <p className="mt-0.5 text-sm text-red-700">
                  You already have an active registration. Redirecting you back to the event page…
                </p>
              </div>
            </div>
          ) : dupCheck === 'idle' || dupCheck === 'checking' ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Checking your registration status…
            </div>
          ) : (
            <RegistrationForm
              eventId={event.id}
              eventSlug={event.slug}
              tierId={tier.id}
              tierName={tier.name}
              unitPrice={event.isFree ? 0 : tier.price}
              qty={qty}
              platformFee={event.isFree ? 0 : event.platformFee ?? 50}
              paymentMethods={event.paymentMethods ?? null}
              bankName={event.bankName ?? null}
              bankAccountName={event.bankAccountName ?? null}
              bankAccountNumber={event.bankAccountNumber ?? null}
              paymentInstructions={event.paymentInstructions ?? null}
              registrationId={existingRegistrationId}
              initialAttendees={pendingGuestData.current?.attendees ?? initialAttendees}
              initialNotes={pendingGuestData.current?.notes ?? initialNotes}
              initialIsFree={initialIsFree}
              existingAccountDetected={pendingGuestData.current?.existingAccountDetected ?? false}
            />
          )
        ) : (
          /* Path B: guest wizard — collects details + OTP, then hands off to RegistrationForm */
          <GuestWizard
            event={event}
            tier={tier}
            qty={qty}
            existingRegistrationId={existingRegistrationId}
            onOtpVerified={handleOtpVerified}
          />
        )}
      </div>
    </main>
  );
}
