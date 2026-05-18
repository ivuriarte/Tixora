'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { calculateFee } from '@axon-tickets/utils';
import api from '@/lib/api';
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

interface Props {
  eventId: string;
  eventSlug: string;
  tierId: string;
  tierName: string;
  unitPrice: number;
  qty: number;
}

export default function RegistrationForm({
  eventId,
  eventSlug,
  tierId,
  tierName,
  unitPrice,
  qty,
}: Props) {
  const router = useRouter();
  const [attendees, setAttendees] = useState<AttendeeFields[]>(() =>
    Array.from({ length: qty }, emptyAttendee),
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = unitPrice * qty;
  const fees = calculateFee(subtotal);
  const total = subtotal + fees;

  const updateAttendee = (index: number, field: keyof AttendeeFields, value: string) => {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

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
      router.push(`/registrations/${reg.id}`);
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

      {/* Attendee forms */}
      {attendees.map((att, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
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
