'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import RegistrationForm from '@/components/RegistrationForm';
import CheckoutStepper from '@/components/CheckoutStepper';
import InAppBrowserBanner from '@/components/InAppBrowserBanner';
import { trackPixelCustomEvent } from '@/lib/metaPixel';
import { trackInternalFunnelEvent, getOrCreateFunnelSessionId } from '@/lib/funnel';
import toast from 'react-hot-toast';

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

interface AgendaSubEvent {
  id: string;
  title: string;
  time?: string;
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
  agenda?: Array<{ id?: string; title?: string; time?: string; isSubEvent?: boolean }> | null;
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
  onOtpVerified: (payload: OtpVerifiedPayload) => void;
}

type WizardStep = 'gate' | 'details' | 'verify';

function emptyAttendee(): AttendeeFields {
  return { firstName: '', lastName: '', email: '', phone: '', company: '', jobTitle: '', birthday: '', gender: '', city: '' };
}

function GuestWizard({ event, tier, qty, onOtpVerified }: GuestWizardProps) {
  const router = useRouter();
  const funnelSessionId = getOrCreateFunnelSessionId();
  const [step, setStep] = useState<WizardStep>('gate');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [extraAttendees, setExtraAttendees] = useState<AttendeeFields[]>(() =>
    Array.from({ length: Math.max(0, qty - 1) }, emptyAttendee),
  );
  const [notes, setNotes] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  const inputCls =
    'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white';

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

  function updateExtra(index: number, field: keyof AttendeeFields, value: string) {
    setExtraAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim().startsWith('+')
      ? phone.trim()
      : phone.trim().length === 10
        ? `+63${phone.trim()}`
        : phone.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFieldError('Please enter a valid email address.');
      return;
    }
    if (normalizedPhone.length < 7) {
      setFieldError('Please enter your mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ data: { userId: string } }>(
        '/auth/request-access',
        {
          email: normalizedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: normalizedPhone,
          eventId: event.id,
          eventSlug: event.slug,
          eventName: event.title,
          sessionId: funnelSessionId,
        },
        { timeout: 15_000 },
      );
      setEmail(normalizedEmail);
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

  async function handleVerify() {
    if (!pendingUserId || otp.length !== 6 || verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);
    setFieldError(null);
    try {
      const verifyRes = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
          isExistingAccount: boolean;
        };
      }>('/auth/verify-access', {
        userId: pendingUserId,
        otp,
        eventId: event.id,
        eventSlug: event.slug,
        sessionId: funnelSessionId,
      });

      const { user: verifiedUser, accessToken, refreshToken, isExistingAccount } = verifyRes.data.data;
      const normalizedPhone = phone.trim().startsWith('+') ? phone.trim() : `+63${phone.trim()}`;
      const leadAttendee: AttendeeFields = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: normalizedPhone,
        company: '',
        jobTitle: '',
        birthday: '',
        gender: '',
        city: '',
      };
      const extraList: AttendeeFields[] = extraAttendees.map((a) => ({
        firstName: a.firstName.trim(),
        lastName: a.lastName.trim(),
        email: a.email.trim(),
        phone: a.phone.trim().startsWith('+') ? a.phone.trim() : `+63${a.phone.trim()}`,
        company: a.company.trim(),
        jobTitle: a.jobTitle.trim(),
        birthday: a.birthday,
        gender: a.gender,
        city: a.city.trim(),
      }));

      trackPixelCustomEvent('OTP_Verified', { event_id: event.id, event_name: event.title });
      void trackInternalFunnelEvent({
        eventId: event.id,
        email: verifiedUser.email,
        step: 'otp_verified',
        status: 'success',
        metadata: { eventSlug: event.slug, isExistingAccount },
      });

      onOtpVerified({
        isExistingAccount,
        attendees: [leadAttendee, ...extraList],
        notes,
        user: verifiedUser,
        accessToken,
        refreshToken,
      });
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

  if (step === 'gate') {
    const returnUrl = `/events/${event.slug}/register?tierId=${tier.id}&qty=${qty}`;
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-1">
          <h2 className="font-bold text-gray-900 text-lg">Do you already have an account?</h2>
          <p className="text-sm text-gray-500">
            If you have registered for an Axon Tickets event before, you already have an account.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/auth/access?redirect=${encodeURIComponent(returnUrl)}`)}
          className="w-full bg-primary text-white rounded-2xl p-5 text-left hover:bg-primary/90 transition-colors group"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mt-0.5">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">Yes, I have an account</p>
              <p className="text-sm text-white/75 mt-0.5">
                Sign in with your email — no password needed.
              </p>
            </div>
            <svg className="w-5 h-5 text-white/60 mt-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('details')}
          className="w-full bg-white border-2 border-gray-200 hover:border-primary/40 rounded-2xl p-5 text-left transition-colors group"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mt-0.5">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">No, I&apos;m new here</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Create your account in seconds — just fill in your details.
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400 mt-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <p className="text-center text-xs text-gray-400 pt-1">
          Not sure? Try &ldquo;Yes, I have an account&rdquo; first — if your email is not found, you can register fresh.
        </p>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <form onSubmit={handleSendCode} className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Your Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              We use these to send your registration and QR ticket.
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
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              We will send your ticket and updates here.
            </p>
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

        {extraAttendees.map((att, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">
              Attendee {i + 2}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
                <input required value={att.firstName} onChange={(e) => updateExtra(i, 'firstName', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Last Name <span className="text-red-500">*</span></label>
                <input required value={att.lastName} onChange={(e) => updateExtra(i, 'lastName', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address <span className="text-red-500">*</span></label>
              <input type="email" required value={att.email} onChange={(e) => updateExtra(i, 'email', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">+63</span>
                <input
                  type="tel"
                  required
                  inputMode="numeric"
                  maxLength={10}
                  value={att.phone}
                  onChange={(e) => updateExtra(i, 'phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9171234567"
                  className="flex-1 rounded-r-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company (optional)</label>
              <input value={att.company} onChange={(e) => updateExtra(i, 'company', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Job Title (optional)</label>
              <input value={att.jobTitle} onChange={(e) => updateExtra(i, 'jobTitle', e.target.value)} className={inputCls} />
            </div>
          </div>
        ))}

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we should know? e.g. dietary needs, accessibility requirements"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {fieldError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{fieldError}</div>}

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500 space-y-1">
          <p>After you fill in your details, we will send a 6-digit code to your email.</p>
          <p>Enter the code to confirm and your spot will be saved.</p>
          <p>No password needed — ever.</p>
        </div>

        <button
          type="submit"
          disabled={loading || !firstName || !lastName || !email || phone.length < 10}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <><Spinner /> Sending your code…</> : 'Continue — Send My Code'}
        </button>
      </form>
    );
  }

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
            <Spinner /> Verifying your code and saving your spot…
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
              onClick={() => { setStep('details'); setOtp(''); setFieldError(null); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Go back and change my details
            </button>
          </div>
        </div>
      </div>
    </div>
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

  // Holds attendee data collected by GuestWizard so RegistrationForm can pre-fill after OTP success.
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

  const handleOtpVerified = useCallback(
    (payload: OtpVerifiedPayload) => {
      pendingGuestData.current = {
        attendees: payload.attendees,
        notes: payload.notes,
        existingAccountDetected: payload.isExistingAccount,
      };
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
  const subEvents: AgendaSubEvent[] = Array.isArray(event.agenda)
    ? event.agenda
        .filter((item) => item?.isSubEvent === true && typeof item.id === 'string' && item.id.trim() && typeof item.title === 'string' && item.title.trim())
        .map((item) => ({
          id: item.id!.trim(),
          title: item.title!.trim(),
          ...(item.time?.trim() ? { time: item.time.trim() } : {}),
        }))
    : [];

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
    subEvents,
    registrationId: existingRegistrationId,
    initialIsFree,
  };

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
              initialAttendees={pendingGuestData.current?.attendees ?? initialAttendees}
              initialNotes={pendingGuestData.current?.notes ?? initialNotes}
              existingAccountDetected={pendingGuestData.current?.existingAccountDetected ?? false}
            />
          )
        ) : (
          <GuestWizard
            event={event}
            tier={tier}
            qty={qty}
            onOtpVerified={handleOtpVerified}
          />
        )}
      </div>
    </main>
  );
}
