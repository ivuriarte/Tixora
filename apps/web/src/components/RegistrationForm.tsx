'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { centavosToPeso, formatPHP } from '@axon-tickets/utils';
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
}

interface AttendeeFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
}

const emptyAttendee = (): AttendeeFields => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
});

interface PaymentMethod {
  name: string;
  type?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
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
  /** When set, form is in edit mode — PATCH existing registration instead of POST new. */
  registrationId?: string;
  /** Pre-filled attendee data for edit mode. */
  initialAttendees?: AttendeeFields[];
  /** Pre-filled notes for edit mode. */
  initialNotes?: string;
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
  registrationId,
  initialAttendees,
  initialNotes,
}: Props) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [attendees, setAttendees] = useState<AttendeeFields[]>(() =>
    initialAttendees ?? Array.from({ length: qty }, emptyAttendee),
  );
  const [useMyDetails, setUseMyDetails] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guard — prevents duplicate submissions during the async gap
  // between the first click and React flushing the loading state update.
  const submittingRef = useRef(false);

  // unitPrice is in centavos (50000 = ₱500). platformFee is in pesos (e.g. 50).
  const subtotalPesos = centavosToPeso(unitPrice * qty);
  const feesPesos = Number(platformFee) || 0;
  const totalPesos = subtotalPesos + feesPesos;

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
      const attendeePayload = attendees.map((a) => ({
        firstName: a.firstName.trim(),
        lastName: a.lastName.trim(),
        email: a.email.trim(),
        ...(a.phone.trim() && { phone: a.phone.trim() }),
        ...(a.company.trim() && { company: a.company.trim() }),
        ...(a.jobTitle.trim() && { jobTitle: a.jobTitle.trim() }),
      }));

      if (registrationId) {
        // Edit mode: update existing pending_payment registration
        await api.patch(`/registrations/${registrationId}/attendees`, {
          attendees: attendeePayload,
          ...(notes.trim() && { notes: notes.trim() }),
        });
        router.push(`/events/${eventSlug}/register/payment/${registrationId}`);
      } else {
        const payload: CreateRegistrationDto = {
          eventId,
          tierId,
          attendees: attendeePayload,
          ...(notes.trim() && { notes: notes.trim() }),
        };
        const res = await api.post('/registrations', payload);
        const reg = res.data?.data ?? res.data;
        // Send user to Step 2 (Payment & Proof Upload)
        router.push(`/events/${eventSlug}/register/payment/${reg.id}`);
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
          <span>{formatPHP(subtotalPesos)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600 mt-1">
          <span>Service fee</span>
          <span>{formatPHP(feesPesos)}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 mt-3 pt-3 border-t border-gray-100">
          <span>Total</span>
          <span className="text-primary">{formatPHP(totalPesos)}</span>
        </div>
      </div>

      {/* Group booking — single-receipt policy notice */}
      {qty > 1 && (
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
              Auto-fill all profile details ({currentUser.email}).
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
              <input
                required
                value={att.firstName}
                onChange={(e) => updateAttendee(i, 'firstName', e.target.value)}
                readOnly={useMyDetails && i === 0}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${
                  useMyDetails && i === 0
                    ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                    : 'border-gray-300 focus:ring-2 focus:ring-primary/30 focus:border-primary'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
              <input
                required
                value={att.lastName}
                onChange={(e) => updateAttendee(i, 'lastName', e.target.value)}
                readOnly={useMyDetails && i === 0}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${
                  useMyDetails && i === 0
                    ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                    : 'border-gray-300 focus:ring-2 focus:ring-primary/30 focus:border-primary'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
            <input
              type="email"
              required
              value={att.email}
              onChange={(e) => updateAttendee(i, 'email', e.target.value)}
              readOnly={useMyDetails && i === 0}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${
                useMyDetails && i === 0
                  ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:ring-2 focus:ring-primary/30 focus:border-primary'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={att.phone}
                onChange={(e) => updateAttendee(i, 'phone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input
                value={att.company}
                onChange={(e) => updateAttendee(i, 'company', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
            <input
              value={att.jobTitle}
              onChange={(e) => updateAttendee(i, 'jobTitle', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>
      ))}

      {/* Notes */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dietary restrictions, accessibility needs, etc."
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
        {loading ? 'Submitting…' : `Confirm Registration — ${formatPHP(totalPesos)}`}
      </button>
    </form>
  );
}
