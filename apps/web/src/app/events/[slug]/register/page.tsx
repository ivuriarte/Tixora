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
const RESEND_COOLDOWN = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface GuestInfo {
  email: string;
  firstName: string;
  lastName: string;
  phone: string; // full number including +63
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── OTP Confirmation Modal ────────────────────────────────────────────────────
// Shown after the user has filled the registration form and uploaded payment
// proof. Email is verified here as a booking confirmation step, not a gate.

interface OtpConfirmModalProps {
  email: string;
  onConfirmed: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onCancel: () => void;
  onChangeEmail: () => void;
}

function OtpConfirmModal({ email, onConfirmed, onResend, onCancel, onChangeEmail }: OtpConfirmModalProps) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const verifyingRef = useRef(false);

  useEffect(() => {
    const focusTimer = setTimeout(() => otpRef.current?.focus(), 50);
    startTimer();
    return () => {
      clearTimeout(focusTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (otp.length === 6 && !verifyingRef.current) void handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  function startTimer() {
    setSecondsLeft(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handleVerify() {
    if (verifyingRef.current || otp.length !== 6) return;
    verifyingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await onConfirmed(otp);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'That code is incorrect. Please try again.';
      setError(Array.isArray(msg) ? msg.join(' ') : msg);
      setOtp('');
      setTimeout(() => otpRef.current?.focus(), 50);
      verifyingRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (secondsLeft > 0 || loading) return;
    setLoading(true);
    try {
      await onResend();
      setOtp('');
      startTimer();
      toast.success('A new code has been sent to your email.');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch {
      toast.error('Could not resend the code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-white text-sm">One last step — confirm your email</p>
            <p className="text-white/75 text-xs mt-0.5">Check your inbox for the code</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            We sent a <strong>6-digit code</strong> to{' '}
            <span className="font-semibold text-gray-900">{email}</span>.
            {' '}Enter it below to confirm your booking.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
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
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={loading}
              placeholder="000000"
              className="w-full text-center text-3xl font-mono tracking-[0.5em] rounded-xl border border-gray-300 px-4 py-4 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-[11px] text-gray-400 text-center mt-1.5">
              Check your inbox and spam folder. The code is valid for 5 minutes.
            </p>
          </div>

          {loading && !error && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Spinner /> Verifying your code…
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}

          <div className="text-center space-y-2">
            {secondsLeft > 0 ? (
              <p className="text-xs text-gray-400">
                Resend available in{' '}
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
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onChangeEmail}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Use a different email
              </button>
              <span className="text-gray-200">|</span>
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Guest Wizard ──────────────────────────────────────────────────────────────
// Collects email and personal details only. OTP is sent later, after payment
// proof is uploaded, so the verification feels like a booking confirmation
// rather than a login gate.

interface GuestWizardProps {
  event: EventData;
  onCompleted: (info: GuestInfo) => void;
}

type WizardStep = 'email' | 'details';

function GuestWizard({ event, onCompleted }: GuestWizardProps) {
  const [step, setStep] = useState<WizardStep>('email');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const inputCls =
    'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white';

  // ── Step 1: Email ─────────────────────────────────────────────────────────

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setFieldError('Please enter a valid email address.');
      return;
    }
    setEmail(normalized);
    setStep('details');
  }

  if (step === 'email') {
    return (
      <form onSubmit={handleEmailSubmit} className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Enter your email to get started</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Your ticket and booking confirmation will be sent here.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email address <span className="text-red-500">*</span>
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
          </div>
        </div>

        {fieldError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {fieldError}
          </div>
        )}

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500 space-y-1">
          <p>
            Registering for <span className="font-medium text-gray-700">{event.title}</span>
          </p>
          <p>You will verify your email after completing payment — no password needed.</p>
        </div>

        <button
          type="submit"
          disabled={!email}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </form>
    );
  }

  // ── Step 2: Name + phone ──────────────────────────────────────────────────

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    if (phoneDigits.length < 10) {
      setFieldError('Please enter a valid 10-digit mobile number (e.g. 9171234567).');
      return;
    }
    onCompleted({
      email,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: `+63${phoneDigits}`,
    });
  }

  return (
    <form onSubmit={handleDetailsSubmit} className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Tell us your name</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Your name and number will appear on your ticket.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              First name <span className="text-red-500">*</span>
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
              Last name <span className="text-red-500">*</span>
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
            Mobile number <span className="text-red-500">*</span>
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
              value={phoneDigits}
              onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9171234567"
              className="flex-1 rounded-r-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            We may use this to reach you about your booking.
          </p>
        </div>
      </div>

      {fieldError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {fieldError}
        </div>
      )}

      <button
        type="submit"
        disabled={!firstName || !lastName || phoneDigits.length < 10}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Review my order
      </button>

      <button
        type="button"
        onClick={() => { setStep('email'); setFieldError(null); }}
        className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
      >
        ← Change email ({email})
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
  const [initialAttendees, setInitialAttendees] = useState<
    AttendeeFields[] | undefined
  >(undefined);
  const [initialNotes, setInitialNotes] = useState<string | undefined>(undefined);
  const [initialIsFree, setInitialIsFree] = useState<boolean | undefined>(undefined);

  // Guest checkout state
  const [guestInfo, setGuestInfo] = useState<GuestInfo | null>(null);
  const [otpModal, setOtpModal] = useState<{ userId: string; email: string } | null>(null);
  const otpTokenRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const funnelSessionId = useRef(getOrCreateFunnelSessionId());

  // Pre-filled attendee data ref (avoids render ordering race between Zustand and React state)
  const pendingGuestData = useRef<{
    attendees: AttendeeFields[];
    notes: string;
    existingAccountDetected: boolean;
  } | null>(null);

  // Duplicate-registration check — only runs for users already authenticated on page load
  const [dupCheck, setDupCheck] = useState<'idle' | 'checking' | 'duplicate' | 'clear'>('idle');
  const dupCheckRanRef = useRef(false);

  const qty = Math.max(1, parseInt(searchParams.qty ?? '1', 10));
  const existingRegistrationId = searchParams.registrationId;

  // ── Guest info collected from GuestWizard (step 1+2) ──────────────────────

  const handleGuestInfoCollected = useCallback(
    (info: GuestInfo) => {
      setGuestInfo(info);
      pendingGuestData.current = {
        attendees: [{
          firstName: info.firstName,
          lastName: info.lastName,
          email: info.email,
          phone: info.phone,
          company: '',
          jobTitle: '',
          birthday: '',
          gender: '',
          city: '',
        }],
        notes: '',
        existingAccountDetected: false,
      };
      void trackInternalFunnelEvent({
        eventId: event?.id,
        email: info.email,
        step: 'ticket_selection_started',
        status: 'started',
        metadata: { eventSlug: event?.slug, eventTitle: event?.title },
      });
      trackPixelCustomEvent('CheckoutStarted', { event_id: event?.id, event_name: event?.title });
    },
    [event],
  );

  // ── OTP send (triggered just before RegistrationForm submits) ─────────────

  const getAuthToken = useCallback(async (): Promise<void> => {
    if (!guestInfo || !event) throw new Error('Missing booking info. Please refresh and try again.');

    let userId: string;
    try {
      const res = await api.post<{ data: { userId: string } }>(
        '/auth/request-access',
        {
          email: guestInfo.email,
          eventId: event.id,
          eventSlug: event.slug,
          eventName: event.title,
          sessionId: funnelSessionId.current,
        },
        { timeout: 15_000 },
      );
      userId = res.data.data.userId;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not send your verification code. Please try again.';
      throw new Error(Array.isArray(msg) ? msg.join(' ') : msg);
    }

    setOtpModal({ userId, email: guestInfo.email });

    return new Promise<void>((resolve, reject) => {
      otpTokenRef.current = { resolve, reject };
    });
  }, [guestInfo, event]);

  // ── OTP resend (from within the modal) ────────────────────────────────────

  const handleOtpResend = useCallback(async () => {
    if (!guestInfo || !event || !otpModal) return;
    const res = await api.post<{ data: { userId: string } }>(
      '/auth/request-access',
      {
        email: guestInfo.email,
        eventId: event.id,
        eventSlug: event.slug,
        eventName: event.title,
        sessionId: funnelSessionId.current,
      },
      { timeout: 15_000 },
    );
    // userId is stable for the same email but update it in case the server rotates it
    const { userId } = res.data.data;
    setOtpModal((prev) => (prev ? { ...prev, userId } : null));
  }, [guestInfo, event, otpModal]);

  // ── OTP verified ──────────────────────────────────────────────────────────

  const handleOtpConfirmed = useCallback(
    async (otp: string) => {
      if (!otpModal || !guestInfo) throw new Error('Booking context was lost. Please refresh and try again.');

      const verifyRes = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
          isNewUser: boolean;
          isExistingAccount: boolean;
        };
      }>('/auth/verify-access', {
        userId: otpModal.userId,
        otp,
        eventId: event?.id,
        eventSlug: event?.slug,
        sessionId: funnelSessionId.current,
      });

      const { user, accessToken, refreshToken, isNewUser } = verifyRes.data.data;

      if (isNewUser) {
        try {
          await axios.patch(
            `${API_URL}/users/me`,
            { firstName: guestInfo.firstName, lastName: guestInfo.lastName, phone: guestInfo.phone },
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
        } catch {
          // Non-critical — account exists and is authenticated. Name/phone
          // falls back to guestInfo values in setAuth below.
        }
      }

      trackPixelCustomEvent('OTP_Verified', { event_id: event?.id, event_name: event?.title });
      void trackInternalFunnelEvent({
        eventId: event?.id,
        email: user.email,
        step: 'otp_verified',
        status: 'success',
        metadata: { eventSlug: event?.slug, isExistingAccount: !isNewUser },
      });

      setAuth(
        {
          id: user.id,
          email: user.email,
          firstName: user.firstName ?? guestInfo.firstName,
          lastName: user.lastName ?? guestInfo.lastName,
          isAdmin: user.isAdmin,
          isVerified: user.isVerified,
        },
        accessToken,
        refreshToken,
      );

      setOtpModal(null);
      otpTokenRef.current?.resolve();
      otpTokenRef.current = null;
    },
    [otpModal, guestInfo, event, setAuth],
  );

  const handleOtpCancel = useCallback(() => {
    setOtpModal(null);
    otpTokenRef.current?.reject(new Error('Email verification was cancelled. Please try again.'));
    otpTokenRef.current = null;
  }, []);

  const handleChangeEmail = useCallback(() => {
    handleOtpCancel();
    setGuestInfo(null);
    pendingGuestData.current = null;
  }, [handleOtpCancel]);

  // ── Data loading ──────────────────────────────────────────────────────────

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
          sorted.map((a: {
            firstName: string; lastName: string; email: string; phone?: string | null;
            company?: string | null; jobTitle?: string | null; birthday?: string | null;
            gender?: string | null; city?: string | null;
          }) => ({
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
    if (!isHydrating) void loadPage();
  }, [isHydrating, loadPage]);

  // Duplicate-registration check — only for users who were already authenticated
  // when they landed on this page. Guest-flow users skip this; the server returns
  // a 409 if they try to register twice anyway.
  useEffect(() => {
    if (!isAuthenticated || !event || dupCheckRanRef.current || existingRegistrationId || guestInfo) return;
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
      .catch(() => setDupCheck('clear'));
  }, [isAuthenticated, event, existingRegistrationId, guestInfo, router]);

  useEffect(() => {
    if (!event) return;
    trackPixelCustomEvent(
      'TicketSelection_Started',
      { event_id: event.id, event_name: event.title },
      `ticket-selection:${event.id}:${searchParams.tierId ?? ''}:${searchParams.qty ?? '1'}`,
    );
  }, [event, searchParams.tierId, searchParams.qty]);

  // ── Loading skeleton ───────────────────────────────────────────────────────

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

  // ── Shared RegistrationForm props ─────────────────────────────────────────

  const registrationFormProps = {
    eventId: event.id,
    eventSlug: event.slug,
    tierId: tier.id,
    tierName: tier.name,
    unitPrice: event.isFree ? 0 : tier.price,
    qty,
    platformFee: event.isFree ? 0 : event.platformFee ?? 50,
    paymentMethods: event.paymentMethods ?? null,
    bankName: event.bankName ?? null,
    bankAccountName: event.bankAccountName ?? null,
    bankAccountNumber: event.bankAccountNumber ?? null,
    paymentInstructions: event.paymentInstructions ?? null,
    registrationId: existingRegistrationId,
    initialIsFree,
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <InAppBrowserBanner />

      {/* OTP confirmation modal — shown after payment proof upload, before final submit */}
      {otpModal && (
        <OtpConfirmModal
          email={otpModal.email}
          onConfirmed={handleOtpConfirmed}
          onResend={handleOtpResend}
          onCancel={handleOtpCancel}
          onChangeEmail={handleChangeEmail}
        />
      )}

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

        {/* ── Path A: user was already authenticated when they landed ── */}
        {isAuthenticated && !guestInfo && (
          dupCheck === 'duplicate' ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold text-red-900">You&apos;re already registered for this event</p>
                <p className="mt-0.5 text-sm text-red-700">
                  You have an active registration. Redirecting you back to the event page…
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
              {...registrationFormProps}
              initialAttendees={initialAttendees}
              initialNotes={initialNotes}
              existingAccountDetected={false}
            />
          )
        )}

        {/* ── Path B: guest — info collected, showing form with OTP gate on submit ── */}
        {guestInfo && (
          <RegistrationForm
            {...registrationFormProps}
            initialAttendees={pendingGuestData.current?.attendees}
            initialNotes={pendingGuestData.current?.notes}
            existingAccountDetected={pendingGuestData.current?.existingAccountDetected ?? false}
            getAuthToken={getAuthToken}
          />
        )}

        {/* ── Path C: no session, no guest info — show the lightweight wizard ── */}
        {!isAuthenticated && !guestInfo && (
          <GuestWizard event={event} onCompleted={handleGuestInfoCollected} />
        )}
      </div>
    </main>
  );
}
