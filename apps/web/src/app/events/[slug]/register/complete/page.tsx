'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type Scenario = 'authenticated' | 'guest' | 'account';

interface RegistrationSnapshot {
  referenceNumber: string;
  status: string;
  attendees?: Array<{ firstName: string; lastName: string; email: string }>;
}

function CompleteContent() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const scenario = (query.get('scenario') ?? 'guest') as Scenario;
  const registrationId = query.get('registrationId') ?? '';
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot>({
    referenceNumber: query.get('reference') ?? '',
    status: 'pending_approval',
  });
  const [showActivation, setShowActivation] = useState(false);
  const [activationStep, setActivationStep] = useState<'profile' | 'otp'>('profile');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [otp, setOtp] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);

  useEffect(() => {
    if (scenario === 'guest' && registrationId) {
      setGuestToken(window.sessionStorage.getItem(`axon_guest_registration_${registrationId}`));
    }
  }, [registrationId, scenario]);

  useEffect(() => {
    if (!registrationId) return;
    if (scenario === 'guest' && !guestToken) return;
    const request = scenario === 'guest' && guestToken
      ? api.get(`/registrations/guest/${registrationId}`, { headers: { 'x-registration-token': guestToken } })
      : api.get(`/registrations/${registrationId}`);
    request
      .then((response) => {
        const data = response.data?.data ?? response.data;
        setSnapshot((current) => ({
          ...current,
          referenceNumber: data.referenceNumber ?? current.referenceNumber,
          status: data.status ?? current.status,
          attendees: data.attendees ?? current.attendees,
        }));
      })
      .catch(() => undefined);
  }, [guestToken, registrationId, scenario]);

  const lead = snapshot.attendees?.[0];

  async function requestAccountCode(event: React.FormEvent) {
    event.preventDefault();
    if (!lead || !consent) return;
    const normalizedPhone = phone.trim().startsWith('+63') ? phone.trim() : `+63${phone.replace(/\D/g, '')}`;
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ data: { userId: string } }>('/auth/request-access', {
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: normalizedPhone,
        eventSlug: params.slug,
      });
      setPendingUserId(response.data.data.userId);
      setActivationStep('otp');
    } catch (requestError: unknown) {
      const message = (requestError as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ?? 'We could not send the verification code.';
      setError(Array.isArray(message) ? message.join(' ') : message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndLink() {
    if (!pendingUserId || otp.length !== 6 || !guestToken) return;
    setLoading(true);
    setError(null);
    try {
      const verification = await api.post<{
        data: {
          user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isOrganizer?: boolean; isVerified: boolean };
          accessToken: string;
          refreshToken: string;
        };
      }>('/auth/verify-access', { userId: pendingUserId, otp, eventSlug: params.slug });
      const { user, accessToken, refreshToken } = verification.data.data;
      setAuth({
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? lead?.firstName ?? '',
        lastName: user.lastName ?? lead?.lastName ?? '',
        isAdmin: user.isAdmin,
        isOrganizer: Boolean(user.isOrganizer),
        isVerified: user.isVerified,
        loginPortal: 'customer',
      }, accessToken, refreshToken);
      await api.patch('/users/me', { phone: phone.trim().startsWith('+63') ? phone.trim() : `+63${phone.replace(/\D/g, '')}`, company, jobTitle });
      await api.patch(`/registrations/${registrationId}/claim-completed-guest`, {}, { headers: { 'x-registration-token': guestToken } });
      window.sessionStorage.removeItem(`axon_guest_registration_${registrationId}`);
      router.replace(`/registrations/${registrationId}`);
    } catch (verificationError: unknown) {
      const message = (verificationError as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ?? 'The code could not be verified.';
      setError(Array.isArray(message) ? message.join(' ') : message);
      setOtp('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activationStep === 'otp' && otp.length === 6) void verifyAndLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationStep, otp]);

  function skipGuestAccount() {
    if (registrationId) window.sessionStorage.removeItem(`axon_guest_registration_${registrationId}`);
    router.push('/');
  }

  return (
    <main className="min-h-screen bg-[#f8f6ff] px-4 py-12 sm:py-16">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-xl shadow-emerald-950/5">
        <div className="bg-emerald-600 px-6 py-8 text-center text-white sm:px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-2xl">✓</div>
          <h1 className="axon-display mt-4 text-4xl">Transaction submitted</h1>
          <p className="mt-2 text-sm text-emerald-50">Your payment proof and attendee details reached Axon Tickets successfully.</p>
        </div>

        <div className="p-6 sm:p-10">
          <div className="grid gap-3 rounded-2xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-wide text-gray-400">Reference</p><p className="mt-1 font-semibold text-gray-900">{snapshot.referenceNumber || 'Being generated'}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-gray-400">Status</p><p className="mt-1 font-semibold text-amber-700">Under review</p></div>
          </div>
          <div className="mt-6 space-y-3 text-sm leading-6 text-gray-600">
            <p><strong className="text-gray-900">What happens next:</strong> the organizer will review your payment proof within 1–2 business days.</p>
            <p>Every attendee email listed in the transaction will receive a submission notice. We will email the review result, and approved attendees will receive their ticket and QR details.</p>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">Please do not submit the same registration again while this transaction is under review.</p>
          </div>

          {scenario === 'guest' ? (
            <div className="mt-7 rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <h2 className="font-bold text-violet-950">Keep this registration easy to track</h2>
              <p className="mt-1 text-sm leading-6 text-violet-800">Create or connect your free Axon account to monitor this review, keep future tickets together, and avoid re-entering your details. Your registration remains valid if you skip.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setShowActivation(true)} disabled={!lead || !guestToken} className="axon-pill bg-primary text-xs text-white disabled:opacity-50">Create or connect account</button>
                <button type="button" onClick={skipGuestAccount} className="axon-pill border border-violet-300 bg-white text-xs text-violet-900">Skip for now</button>
              </div>
            </div>
          ) : (
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link href={`/registrations/${registrationId}`} className="axon-pill justify-center bg-primary text-xs text-white">View My Registration</Link>
              <Link href="/" className="axon-pill justify-center border border-gray-300 text-xs text-gray-700">Go to Homepage</Link>
            </div>
          )}
        </div>
      </section>

      {showActivation && (
        <div role="dialog" aria-modal="true" aria-labelledby="activation-title" className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d021c]/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="activation-title" className="text-xl font-bold text-gray-900">{activationStep === 'profile' ? 'Complete your account' : 'Verify your email'}</h2>
            {activationStep === 'profile' ? (
              <form onSubmit={requestAccountCode} className="mt-4 space-y-4">
                <p className="text-sm leading-6 text-gray-600">Your verified transaction name and email will be used. We will not reveal or load any existing profile until the email code is verified.</p>
                <label className="block text-sm font-medium text-gray-700">Mobile Number *<input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+639171234567" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-medium text-gray-700">Company<input value={company} onChange={(event) => setCompany(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-medium text-gray-700">Job Title<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5" /></label>
                <label className="flex items-start gap-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-900"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" /><span>I consent to creating or linking an Axon account using my verified email and connecting this registration to it.</span></label>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2"><button type="submit" disabled={loading || !consent || phone.replace(/\D/g, '').length < 10} className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Sending code…' : 'Send verification code'}</button><button type="button" onClick={() => setShowActivation(false)} className="rounded-xl border border-gray-300 px-4 text-sm">Cancel</button></div>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600">Enter the 6-digit code sent to {lead?.email}. Only then will Axon link or create the account.</p>
                <input autoFocus inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border border-gray-300 px-4 py-4 text-center font-mono text-3xl tracking-[0.4em]" />
                {loading && <p className="text-center text-sm text-gray-500">Verifying and linking your registration…</p>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button type="button" disabled={loading} onClick={() => { setActivationStep('profile'); setOtp(''); setError(null); }} className="w-full text-sm text-gray-500">← Back</button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function GuestRegistrationCompletePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f8f6ff]" />}><CompleteContent /></Suspense>;
}
