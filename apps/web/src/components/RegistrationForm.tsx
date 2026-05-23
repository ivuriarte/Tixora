'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { CreateRegistrationDto } from '@axon-tickets/types';

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
}: Props) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [attendees, setAttendees] = useState<AttendeeFields[]>(() =>
    Array.from({ length: qty }, emptyAttendee),
  );
  const [useMyDetails, setUseMyDetails] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = unitPrice * qty;
  const fees = Number(platformFee) || 0;
  const total = subtotal + fees;

  const updateAttendee = (index: number, field: keyof AttendeeFields, value: string) => {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleToggleMyDetails = (checked: boolean) => {
    setUseMyDetails(checked);
    if (checked && currentUser) {
      setAttendees((prev) => {
        const next = [...prev];
        next[0] = {
          ...next[0],
          firstName: currentUser.firstName || next[0].firstName,
          lastName: currentUser.lastName || next[0].lastName,
          email: currentUser.email || next[0].email,
        };
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
    setError(null);
    setLoading(true);

    try {
      const payload: CreateRegistrationDto = {
        eventId,
        tierId,
        attendees: attendees.map((a) => ({
          firstName: a.firstName.trim(),
          lastName: a.lastName.trim(),
          email: a.email.trim(),
          ...(a.phone.trim() && { phone: a.phone.trim() }),
          ...(a.company.trim() && { company: a.company.trim() }),
          ...(a.jobTitle.trim() && { jobTitle: a.jobTitle.trim() }),
        })),
        ...(notes.trim() && { notes: notes.trim() }),
      };

      const res = await api.post('/registrations', payload);
      const reg = res.data?.data ?? res.data;
      // Send user to Step 2 (Payment & Proof Upload)
      router.push(`/events/${eventSlug}/register/payment/${reg.id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Something went wrong. Please try again.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
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
          <span>₱{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600 mt-1">
          <span>Service fee</span>
          <span>₱{fees.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 mt-3 pt-3 border-t border-gray-100">
          <span>Total</span>
          <span className="text-primary">₱{total.toLocaleString()}</span>
        </div>
      </div>

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
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-3">
          <input
            id="use-my-details"
            type="checkbox"
            checked={useMyDetails}
            onChange={(e) => handleToggleMyDetails(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="use-my-details" className="text-sm text-gray-700 cursor-pointer">
            <span className="font-medium text-gray-900">Use my account details for Attendee 1</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Auto-fill name and email from your profile ({currentUser.email}).
            </p>
          </label>
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
              <input
                required
                value={att.lastName}
                onChange={(e) => updateAttendee(i, 'lastName', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
        {loading ? 'Submitting…' : `Confirm Registration — ₱${total.toLocaleString()}`}
      </button>
    </form>
  );
}
