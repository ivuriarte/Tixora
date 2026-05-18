'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatManila } from '@axon-tickets/utils';
import api from '@/lib/api';
import type { Registration, RegistrationStatus } from '@axon-tickets/types';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: 'Pending Payment',
  proof_submitted: 'Proof Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  proof_submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function RegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reg, setReg] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api
      .get(`/registrations/${id}`)
      .then((res) => {
        const body = res.data;
        setReg(body?.data ?? body);
      })
      .catch(() => setError('Registration not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!confirm('Cancel this registration? This cannot be undone.')) return;
    setCancelling(true);
    try {
      await api.patch(`/registrations/${id}/cancel`);
      setReg((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
    } catch {
      alert('Failed to cancel registration.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !reg) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">{error ?? 'Registration not found.'}</p>
          <button
            onClick={() => router.push('/registrations')}
            className="mt-4 text-primary text-sm hover:underline"
          >
            Back to registrations
          </button>
        </div>
      </main>
    );
  }

  const canCancel = ['pending_payment', 'proof_submitted'].includes(reg.status);
  const hasPaymentInfo =
    reg.event.bankName || reg.event.bankAccountNumber || reg.event.gcashNumber;

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => router.push('/registrations')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← My Registrations
          </button>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-2xl font-bold text-primary font-mono">{reg.referenceNumber}</p>
              <p className="text-sm text-gray-500 mt-0.5">{reg.event.title}</p>
            </div>
            <span
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full ${STATUS_COLORS[reg.status]}`}
            >
              {STATUS_LABELS[reg.status]}
            </span>
          </div>
        </div>

        {/* Event info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">{reg.event.title}</p>
          <p>{formatManila(new Date(reg.event.startsAt))} · {reg.event.venue}</p>
          {reg.event.address && <p>{reg.event.address}</p>}
        </div>

        {/* Payment instructions */}
        {hasPaymentInfo && reg.status === 'pending_payment' && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Payment Instructions</h2>
            <div className="text-sm text-gray-700 space-y-1">
              {reg.event.bankName && (
                <p>
                  <span className="font-medium">Bank:</span> {reg.event.bankName}
                </p>
              )}
              {reg.event.bankAccountNumber && (
                <p>
                  <span className="font-medium">Account No.:</span> {reg.event.bankAccountNumber}
                </p>
              )}
              {reg.event.bankAccountName && (
                <p>
                  <span className="font-medium">Account Name:</span> {reg.event.bankAccountName}
                </p>
              )}
              {reg.event.gcashNumber && (
                <p>
                  <span className="font-medium">GCash:</span> {reg.event.gcashNumber}
                </p>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Transfer exactly <span className="font-semibold text-primary">₱{reg.total.toLocaleString()}</span> and include your reference number in the transfer remarks.
            </p>
          </div>
        )}

        {/* Amount */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-sm space-y-2">
          <h2 className="font-semibold text-gray-900 mb-3">Order Breakdown</h2>
          <div className="flex justify-between text-gray-600">
            <span>{reg.tierName ?? 'Ticket'} × {reg.attendeeCount}</span>
            <span>₱{reg.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service fee</span>
            <span>₱{reg.fees.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total Due</span>
            <span className="text-primary">₱{reg.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Attendees</h2>
          <div className="divide-y divide-gray-100">
            {reg.attendees.map((att, i) => (
              <div key={att.id} className="py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {att.firstName} {att.lastName}
                  </span>
                  {att.isLead && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Lead
                    </span>
                  )}
                </div>
                <p className="text-gray-500 mt-0.5">{att.email}</p>
                {att.phone && <p className="text-gray-400">{att.phone}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Rejection reason */}
        {reg.status === 'rejected' && reg.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
            <p className="font-semibold mb-1">Rejection Reason</p>
            <p>{reg.rejectionReason}</p>
          </div>
        )}

        {/* Cancel */}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full py-3 rounded-xl border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {cancelling ? 'Cancelling…' : 'Cancel Registration'}
          </button>
        )}
      </div>
    </main>
  );
}
