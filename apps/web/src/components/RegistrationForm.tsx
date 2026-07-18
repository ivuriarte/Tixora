'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPHP } from '@axon-tickets/utils';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { CreateRegistrationDto } from '@axon-tickets/types';

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  birthday?: string | null;
  gender?: string | null;
  city?: string | null;
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

const emptyAttendee = (): AttendeeFields => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
  birthday: '',
  gender: '',
  city: '',
});

interface PaymentMethod {
  name: string;
  type?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
}

interface AgendaSubEventOption {
  id: string;
  title: string;
  time?: string;
}

interface Props {
  eventId: string;
  eventSlug: string;
  tierId: string;
  tierName: string;
  unitPrice: number;
  qty: number;
  /** Per-event flat service fee in pesos (defaults to 50). */
  platformFee?: number;
  paymentMethods?: PaymentMethod[] | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  paymentInstructions?: string | null;
  subEvents?: AgendaSubEventOption[];
  /** When set, form is in edit mode — PATCH existing registration instead of POST new. */
  registrationId?: string;
  /** Server-returned isFree for edit mode — used to decide post-submit routing. */
  initialIsFree?: boolean;
  /** Pre-filled attendee data for edit mode or post-OTP guest flow. */
  initialAttendees?: AttendeeFields[];
  /** Pre-filled notes for edit mode or post-OTP guest flow. */
  initialNotes?: string;
  /** True when a guest used "I'm new here" but the email matched an existing verified account. */
  existingAccountDetected?: boolean;
}

export default function RegistrationForm({
  eventId,
  eventSlug,
  tierId,
  tierName,
  unitPrice,
  qty,
  platformFee = 50,
  paymentMethods,
  bankName,
  bankAccountName,
  bankAccountNumber,
  paymentInstructions,
  subEvents = [],
  registrationId,
  initialIsFree,
  initialAttendees,
  initialNotes,
  existingAccountDetected = false,
}: Props) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [attendees, setAttendees] = useState<AttendeeFields[]>(() =>
    initialAttendees?.map((attendee) => ({ ...emptyAttendee(), ...attendee })) ?? Array.from({ length: qty }, emptyAttendee),
  );
  // Default ON unless we're in edit mode (initialAttendees already provides the data)
  const [useMyDetails, setUseMyDetails] = useState(!initialAttendees);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [selectedSubEventIds, setSelectedSubEventIds] = useState<string[]>(() => subEvents.map((item) => item.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [checkingReferral, setCheckingReferral] = useState(false);
  // Synchronous guard — prevents duplicate submissions during the async gap
  // between the first click and React flushing the loading state update.
  const submittingRef = useRef(false);
  const subEventsInitializedRef = useRef(subEvents.length > 0);

  // Auto-fetch profile on mount when the toggle is ON (new registrations only)
  useEffect(() => {
    if (!initialAttendees && currentUser) {
      void handleToggleMyDetails(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotalPesos = unitPrice * qty;
  const feesPesos = Number(platformFee) || 0;
  const totalPesos = Math.max(0, subtotalPesos - referralDiscount) + feesPesos;
  const isFreeRegistration = unitPrice === 0 && feesPesos === 0;
  const requiresSubEvent = !registrationId && subEvents.length > 0;
  const allSubEventsSelected = subEvents.length > 0 && selectedSubEventIds.length === subEvents.length;

  useEffect(() => {
    if (registrationId || subEvents.length === 0) return;
    setSelectedSubEventIds((current) => {
      const availableIds = subEvents.map((item) => item.id);
      if (!subEventsInitializedRef.current) {
        subEventsInitializedRef.current = true;
        return availableIds;
      }
      const next = current.filter((id) => availableIds.includes(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      return next;
    });
  }, [registrationId, subEvents]);

  const updateAttendee = (index: number, field: keyof AttendeeFields, value: string) => {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleToggleMyDetails = async (enabled: boolean) => {
    setUseMyDetails(enabled);
    if (enabled) {
      let profile = profileData;
      if (!profile) {
        setProfileLoading(true);
        try {
          const res = await api.get<{ data: ProfileData }>('/users/me');
          profile = (res.data as unknown as { data: ProfileData }).data ?? (res.data as unknown as ProfileData);
          setProfileData(profile);
        } catch {
          // fall back to auth store values
        } finally {
          setProfileLoading(false);
        }
      }
      setAttendees((prev) => {
        const next = [...prev];
        next[0] = {
          firstName: profile?.firstName ?? currentUser?.firstName ?? '',
          lastName: profile?.lastName ?? currentUser?.lastName ?? '',
          email: profile?.email ?? currentUser?.email ?? '',
          phone: profile?.phone ?? '',
          company: profile?.company ?? '',
          jobTitle: profile?.jobTitle ?? '',
          birthday: profile?.birthday ? profile.birthday.slice(0, 10) : '',
          gender: profile?.gender ?? '',
          city: profile?.city ?? '',
        };
        return next;
      });
    } else {
      setAttendees((prev) => {
        const next = [...prev];
        next[0] = emptyAttendee();
        return next;
      });
    }
  };

  async function applyReferralCode() {
    if (!referralCode.trim()) {
      setReferralDiscount(0);
      setReferralMessage(null);
      return;
    }
    setCheckingReferral(true);
    try {
      const response = await api.post<{ data: { discount: number; name: string } }>('/registrations/validate-referral', {
        eventId,
        tierId,
        code: referralCode.trim(),
        attendeeCount: qty,
      });
      const result = response.data.data;
      setReferralDiscount(result.discount);
      setReferralCode(referralCode.trim().toUpperCase());
      setReferralMessage(`${result.name} applied — you save ${formatPHP(result.discount)}.`);
    } catch (err: any) {
      setReferralDiscount(0);
      setReferralMessage(null);
      const message = err?.response?.data?.message ?? 'Referral code could not be applied.';
      setReferralError(Array.isArray(message) ? message.join(' ') : message);
    } finally {
      setCheckingReferral(false);
    }
  }

  const hasPaymentDetails =
    (paymentMethods && paymentMethods.length > 0) ||
    bankName ||
    bankAccountNumber ||
    paymentInstructions;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous guard — blocks any duplicate event fired before React
    // has had a chance to re-render with loading=true.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setLoading(true);

    try {
      if (requiresSubEvent && selectedSubEventIds.length === 0) {
        setError('Please choose at least one sub-event to attend.');
        return;
      }

      const attendeePayload = attendees.map((a) => ({
        firstName: a.firstName.trim(),
        lastName: a.lastName.trim(),
        email: a.email.trim(),
        ...(a.phone.trim() && { phone: a.phone.trim() }),
        ...(a.company.trim() && { company: a.company.trim() }),
        ...(a.jobTitle.trim() && { jobTitle: a.jobTitle.trim() }),
        ...(a.birthday && { birthday: a.birthday }),
        ...(a.gender && { gender: a.gender as 'female' | 'male' | 'non_binary' | 'prefer_not_to_say' | 'self_described' }),
        ...(a.city.trim() && { city: a.city.trim() }),
      }));

      // Sync any edited profile fields back to the user's account
      if (useMyDetails && profileData && currentUser && !registrationId) {
        const a = attendees[0];
        const profilePatch: Record<string, string> = {};
        if (a.firstName.trim() && a.firstName.trim() !== profileData.firstName) profilePatch.firstName = a.firstName.trim();
        if (a.lastName.trim() && a.lastName.trim() !== profileData.lastName) profilePatch.lastName = a.lastName.trim();
        if (a.phone.trim() !== (profileData.phone ?? '')) profilePatch.phone = a.phone.trim();
        if (a.company.trim() !== (profileData.company ?? '')) profilePatch.company = a.company.trim();
        if (a.jobTitle.trim() !== (profileData.jobTitle ?? '')) profilePatch.jobTitle = a.jobTitle.trim();
        if (a.city.trim() && a.city.trim() !== (profileData.city ?? '')) profilePatch.city = a.city.trim();
        if (a.birthday && a.birthday !== (profileData.birthday?.slice(0, 10) ?? '')) profilePatch.birthday = a.birthday;
        if (a.gender && a.gender !== (profileData.gender ?? '')) profilePatch.gender = a.gender;
        if (Object.keys(profilePatch).length > 0) {
          try { await api.patch('/users/me', profilePatch); } catch { /* non-blocking */ }
        }
      }

      if (registrationId) {
        // Edit mode: update existing registration attendee details
        await api.patch(`/registrations/${registrationId}/attendees`, {
          attendees: attendeePayload,
          ...(notes.trim() && { notes: notes.trim() }),
        });
        if (initialIsFree) {
          router.push(`/registrations/${registrationId}`);
        } else {
          router.push(`/events/${eventSlug}/register/payment/${registrationId}`);
        }
      } else {
        const payload: CreateRegistrationDto = {
          eventId,
          tierId,
          ...(selectedSubEventIds.length > 0 && { subEventIds: selectedSubEventIds }),
          attendees: attendeePayload,
          ...(notes.trim() && { notes: notes.trim() }),
          ...(referralDiscount > 0 && referralCode.trim() && { referralCode: referralCode.trim() }),
        };
        const res = await api.post('/registrations', payload);
        const reg = res.data?.data ?? res.data;
        if (reg.isFree || reg.status === 'pending_approval') {
          router.push(`/registrations/${reg.id}`);
        } else {
          router.push(`/events/${eventSlug}/register/payment/${reg.id}`);
        }
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Something went wrong. Please try again.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Order Summary</h2>
        <div className="flex justify-between text-sm text-gray-600">
          <span>
            {tierName} × {qty}
          </span>
          <span>{subtotalPesos === 0 ? 'Free' : formatPHP(subtotalPesos)}</span>
        </div>
        {!isFreeRegistration && (
          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>Service fee</span>
            <span>{formatPHP(feesPesos)}</span>
          </div>
        )}
        {referralDiscount > 0 && (
          <div className="flex justify-between text-sm font-medium text-emerald-700 mt-1">
            <span>Referral discount ({referralCode})</span>
            <span>−{formatPHP(referralDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900 mt-3 pt-3 border-t border-gray-100">
          <span>Total</span>
          <span className="text-primary">{isFreeRegistration ? 'Free' : formatPHP(totalPesos)}</span>
        </div>
      </div>

      {!registrationId && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <label htmlFor="referral-code" className="block text-sm font-semibold text-gray-900">Have a referral code?</label>
          <p className="mt-1 text-xs text-gray-600">Apply it before confirming to preview your final total.</p>
          <div className="mt-3 flex gap-2">
            <input
              id="referral-code"
              value={referralCode}
              onChange={(event) => { setReferralCode(event.target.value.toUpperCase()); setReferralDiscount(0); setReferralMessage(null); setReferralError(null); setError(null); }}
              maxLength={32}
              autoComplete="off"
              placeholder="Enter code"
              className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-mono uppercase tracking-wide focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <button type="button" onClick={applyReferralCode} disabled={checkingReferral || !referralCode.trim()} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {checkingReferral ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {referralMessage && <p role="status" className="mt-2 text-xs font-medium text-emerald-700">✓ {referralMessage}</p>}
          {referralError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">✗ {referralError}</p>}
        </div>
      )}

      {/* Group booking — single-receipt policy notice */}
      {qty > 1 && !isFreeRegistration && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-amber-600"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 0 0-2-2z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Group booking &mdash; 1 receipt for the full {formatPHP(totalPesos)}
            </p>
            <p className="mt-1 text-xs text-amber-700 leading-relaxed">
              You&apos;re registering <span className="font-semibold">{qty} attendees</span>. After
              confirming, transfer the total amount in a{' '}
              <span className="font-semibold">single transaction</span> and upload{' '}
              <span className="font-semibold">one receipt</span> as proof of payment. Multiple
              receipts per order will not be accepted.
            </p>
          </div>
        </div>
      )}

      {/* Payment details */}
      {hasPaymentDetails && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Payment Details</h2>
          <p className="text-xs text-gray-500 mb-3">
            Pay manually using one of the methods below. Submit your proof of payment after registering.
          </p>
          <div className="space-y-3">
            {paymentMethods?.map((m, idx) => (
              <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900">{m.name}</span>
                  {m.type && (
                    <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {m.type}
                    </span>
                  )}
                </div>
                {m.accountName && (
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="font-medium">Account Name:</span> {m.accountName}
                  </div>
                )}
                {m.accountNumber && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account No.:</span> {m.accountNumber}
                  </div>
                )}
                {m.instructions && (
                  <div className="text-xs text-gray-500 mt-1">{m.instructions}</div>
                )}
              </div>
            ))}
            {(bankName || bankAccountNumber) && (
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                <div className="font-semibold text-sm text-gray-900">Bank Transfer</div>
                {bankName && (
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="font-medium">Bank:</span> {bankName}
                  </div>
                )}
                {bankAccountName && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account Name:</span> {bankAccountName}
                  </div>
                )}
                {bankAccountNumber && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account No.:</span> {bankAccountNumber}
                  </div>
                )}
              </div>
            )}
            {paymentInstructions && (
              <div className="text-xs text-gray-600 whitespace-pre-line">{paymentInstructions}</div>
            )}
          </div>
        </div>
      )}

      {/* Autofill toggle */}
      {currentUser && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Use my account details for Attendee 1</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Pre-filled from your account ({currentUser.email}). Required fields highlighted in amber need your attention.
            </p>
          </div>
          <button
            type="button"
            disabled={profileLoading}
            onClick={() => handleToggleMyDetails(!useMyDetails)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              useMyDetails ? 'bg-primary' : 'bg-gray-200'
            } ${profileLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-pressed={useMyDetails}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                useMyDetails ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Existing-account notice — shown when the guest used "I'm new here" but the email
          already belonged to a verified account. Non-blocking: user can still review and proceed. */}
      {existingAccountDetected && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mt-0.5 h-5 w-5 shrink-0 text-blue-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-blue-900">Account already exists</p>
            <p className="mt-0.5 text-sm text-blue-700">
              We found an existing account using these details. You may review or update your
              attendee information before continuing.
            </p>
          </div>
        </div>
      )}

      {/* Attendee forms */}
      {attendees.map((att, i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 animate-fade-in-up"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
        >
          <h3 className="font-semibold text-gray-900">
            Attendee {i + 1}
            {i === 0 && (
              <span className="ml-2 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Lead Registrant
              </span>
            )}
          </h3>

          {(() => {
            // For Attendee 1 with toggle ON:
            // — field is empty → amber highlight so user knows it needs filling
            // — field has a value → normal editable (changes sync back to profile on submit)
            const auto = useMyDetails && i === 0;
            const missingCls = 'border-amber-400 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400';
            const normalCls = 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

            const cls = (val: string) =>
              !auto ? normalCls : val.trim() ? normalCls : missingCls;

            const MissingHint = () => (
              <p className="mt-1 text-[11px] text-amber-600 font-medium">
                ⚠ Missing from your profile — please fill this in
              </p>
            );

            return (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                    <input
                      required
                      value={att.firstName}
                      onChange={(e) => updateAttendee(i, 'firstName', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.firstName)}`}
                    />
                    {auto && !att.firstName.trim() && <MissingHint />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                    <input
                      required
                      value={att.lastName}
                      onChange={(e) => updateAttendee(i, 'lastName', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.lastName)}`}
                    />
                    {auto && !att.lastName.trim() && <MissingHint />}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={att.email}
                    onChange={(e) => updateAttendee(i, 'email', e.target.value)}
                    readOnly={auto}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${auto ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed' : normalCls}`}
                  />
                  {auto && !att.email.trim() && <MissingHint />}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={att.phone}
                      onChange={(e) => updateAttendee(i, 'phone', e.target.value)}
                      placeholder="+639171234567"
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.phone)}`}
                    />
                    {auto && !att.phone.trim() && <MissingHint />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                    <input
                      value={att.company}
                      onChange={(e) => updateAttendee(i, 'company', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.company)}`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                  <input
                    value={att.jobTitle}
                    onChange={(e) => updateAttendee(i, 'jobTitle', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${cls(att.jobTitle)}`}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Birthday <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input type="date" max={new Date().toISOString().slice(0, 10)} value={att.birthday} onChange={(e) => updateAttendee(i, 'birthday', e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Gender <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select value={att.gender} onChange={(e) => updateAttendee(i, 'gender', e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`}>
                      <option value="">Select</option>
                      <option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="self_described">Self-described</option><option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      City <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input value={att.city} onChange={(e) => updateAttendee(i, 'city', e.target.value)} placeholder="Davao City" className={`w-full border rounded-lg px-3 py-2 text-sm ${normalCls}`} />
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      ))}

      {requiresSubEvent && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="block text-sm font-semibold text-gray-900">
                Sub-events <span className="text-red-500">*</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">Select every sub-event this attendee will join.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
              <input
                type="checkbox"
                checked={allSubEventsSelected}
                onChange={(e) => {
                  setSelectedSubEventIds(e.target.checked ? subEvents.map((item) => item.id) : []);
                  setError(null);
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Select all
            </label>
          </div>
          <div className="mt-4 grid gap-2">
            {subEvents.map((item) => {
              const checked = selectedSubEventIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    checked ? 'border-primary bg-primary/5 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedSubEventIds((current) => {
                        if (e.target.checked) return [...new Set([...current, item.id])];
                        return current.filter((id) => id !== item.id);
                      });
                      setError(null);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>{item.time ? `${item.time} - ${item.title}` : item.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything we should know? e.g. food allergies, wheelchair access needed, etc."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Saving your spot…' : `Confirm My Registration — ${isFreeRegistration ? 'Free' : formatPHP(totalPesos)}`}
      </button>
    </form>
  );
}
