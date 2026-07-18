'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatManila, formatPHP } from '@axon-tickets/utils';
import api from '@/lib/api';
import PaymentProofUpload from '@/components/PaymentProofUpload';
import type { Registration, RegistrationStatus } from '@axon-tickets/types';
import { trackPixelCustomEvent, trackPixelEvent } from '@/lib/metaPixel';
import { ErrorState, ScreenSkeleton } from '@/components/ScreenState';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: 'Waiting for Payment',
  proof_submitted: 'Being Reviewed',
  pending_approval: 'Awaiting Confirmation',
  verified: 'Confirmed',
  rejected: 'Not Approved',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  proof_submitted: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function RegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reg, setReg] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [profileNudgeDismissed, setProfileNudgeDismissed] = useState(false);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  const fetchReg = useCallback(async () => {
    try {
      const res = await api.get(`/registrations/${id}`);
      const body = res.data;
      setReg(body?.data ?? body);
    } catch {
      setError('Registration not found.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchReg();
  }, [fetchReg]);

  // Check if the user's demographic profile is incomplete after reg loads
  useEffect(() => {
    if (!reg) return;
    api.get<{ data: { birthday: string | null; gender: string | null; city: string | null } }>('/users/me')
      .then((res) => {
        const { birthday, gender, city } = res.data.data;
        if (!birthday || !gender || !city) setProfileIncomplete(true);
      })
      .catch(() => { /* non-critical — silently ignore */ });
  }, [reg]);

  useEffect(() => {
    if (!reg) return;
    const trackedEventId = (reg as Registration & { eventId?: string }).eventId;

    if (reg.status === 'pending_payment') {
      trackPixelEvent('InitiateCheckout', {
        content_type: 'event_ticket',
        content_ids: trackedEventId ? [trackedEventId] : [],
        content_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: reg.total,
        num_items: reg.attendeeCount,
      }, `initiate-checkout:${reg.id}`);
    }

    if (reg.status === 'pending_approval' && reg.isFree) {
      trackPixelCustomEvent('Registration_Free_Submitted', {
        event_id: trackedEventId ?? null,
        event_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: 0,
      }, `free-submitted:${reg.id}`);
    }

    if (reg.status === 'verified') {
      trackPixelEvent(
        'Purchase',
        {
          content_type: 'event_ticket',
          content_ids: trackedEventId ? [trackedEventId] : [],
          content_name: reg.event.title,
          currency: reg.currency || 'PHP',
          value: reg.total,
          num_items: reg.attendeeCount,
        },
        `purchase-registration:${reg.id}`,
      );
    }
  }, [reg]);

  const handleCancel = async () => {
    if (!confirm('Cancel this registration? This cannot be undone.')) return;
    setCancelling(true);
    try {
      await api.patch(`/registrations/${id}/cancel`);
      setReg((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
      // Invalidate the event-page registration check so RegistrationGuard
      // immediately reflects the cancellation when the user navigates back.
      void queryClient.invalidateQueries({ queryKey: ['registration-check'] });
    } catch {
      toast.error('Cancellation failed. Please refresh the page and try again.');
    } finally {
      setCancelling(false);
    }
  };

  const handleProofUploaded = async () => {
    if (reg) {
      const trackedEventId = (reg as Registration & { eventId?: string }).eventId;
      trackPixelEvent('AddPaymentInfo', {
        content_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: reg.total,
      });
      trackPixelCustomEvent('Registration_Submitted_For_Review', {
        event_id: trackedEventId ?? null,
        event_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: reg.total,
      }, `reg-submitted-review:${reg.id}`);
    }
    await fetchReg();
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
          <ScreenSkeleton rows={5} />
        </div>
      </main>
    );
  }

  if (error || !reg) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="w-full max-w-lg px-4"><ErrorState title="Registration unavailable" message={error ?? 'This registration may have been removed or the link is incorrect.'} action={<button onClick={() => router.push('/account/tickets')} className="axon-pill bg-primary text-xs text-white">Back to my events</button>} /></div>
      </main>
    );
  }

  const canCancel = ['pending_payment', 'proof_submitted', 'pending_approval'].includes(reg.status);
  const isFree = reg.isFree;
  const hasPaymentInfo =
    !isFree && (reg.event.bankName || reg.event.bankAccountNumber || reg.event.gcashNumber);

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">

        {/* Profile completion nudge — shown once after registration if demographics are missing */}
        {profileIncomplete && !profileNudgeDismissed && (
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-4">
            <svg className="w-5 h-5 text-primary mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Complete your profile</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Add your birthday, gender, and city so organizers can personalise your experience.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <Link
                  href={`/account/complete-profile?returnTo=/registrations/${id}`}
                  className="inline-flex min-h-[44px] items-center text-xs font-bold text-primary hover:underline"
                >
                  Complete now
                </Link>
                <button
                  type="button"
                  onClick={() => setProfileNudgeDismissed(true)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Skip for now
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setProfileNudgeDismissed(true)}
              className="text-gray-300 hover:text-gray-500 shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Header */}
        <div>
          <button
            onClick={() => router.push('/account/tickets')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← My Events
          </button>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-3xl font-black tracking-tight text-primary">{reg.referenceNumber}</h1>
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
          {reg.event.landmark && <p>Near: {reg.event.landmark}</p>}
        </div>

        {/* Payment instructions */}
        {hasPaymentInfo && reg.status === 'pending_payment' && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3">
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
              Send exactly <span className="font-semibold text-primary">{formatPHP(reg.total)}</span> and write your reference number in the transfer note or remarks box.
            </p>
          </div>
        )}

        {/* Amount */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-sm space-y-2">
          <h2 className="font-semibold text-gray-900 mb-3">Order Breakdown</h2>
          <div className="flex justify-between text-gray-600">
            <span>{reg.tierName ?? 'Ticket'} × {reg.attendeeCount}</span>
            <span>{formatPHP(reg.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service fee</span>
            <span>{formatPHP(reg.fees)}</span>
          </div>
          {reg.discount > 0 && <div className="flex justify-between font-medium text-emerald-700"><span>Referral discount{reg.referralCode ? ` (${reg.referralCode})` : ''}</span><span>−{formatPHP(reg.discount)}</span></div>}
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total Due</span>
            <span className="text-primary">{formatPHP(reg.total)}</span>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Attendees</h2>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {reg.attendees.length} {reg.attendees.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="space-y-3">
            {reg.attendees.map((att, i) => {
              const qrStatus = att.checkedInAt
                ? { label: 'Checked In', cls: 'bg-green-100 text-green-700' }
                : att.hasQr
                ? { label: 'QR Ready', cls: 'bg-blue-100 text-blue-700' }
                : { label: 'QR Pending', cls: 'bg-gray-100 text-gray-500' };

              return (
                <div key={att.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-gray-900 truncate">
                        {att.firstName} {att.lastName}
                      </span>
                      {att.isLead && (
                        <span className="shrink-0 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Lead
                        </span>
                      )}
                    </div>
                    {reg.status === 'verified' && (
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${qrStatus.cls}`}>
                        {qrStatus.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 pl-8 space-y-0.5 text-xs text-gray-500">
                    <p>{att.email}</p>
                    {att.phone && <p>{att.phone}</p>}
                    {reg.tierName && (
                      <p className="font-medium text-gray-700">{reg.tierName}</p>
                    )}
                    {att.checkedInAt && (
                      <p className="text-green-600 font-medium">
                        Checked in {formatManila(new Date(att.checkedInAt))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p>
              <span className="font-semibold">Tickets cannot be transferred.</span> Each ticket belongs to the person named above.
              Please bring a valid ID with the same name to the entrance.
            </p>
          </div>
        </div>

        {/* Rejection reason */}
        {reg.status === 'rejected' && reg.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
            <p className="font-semibold mb-1">Rejection Reason</p>
            <p>{reg.rejectionReason}</p>
          </div>
        )}

        {/* Payment proof section */}
        {(reg.status === 'pending_payment' || reg.status === 'rejected') && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">
              {reg.status === 'rejected' ? 'Re-upload Payment Proof' : 'Upload Payment Proof'}
            </h2>
            <PaymentProofUpload registrationId={reg.id} onUploaded={handleProofUploaded} />
          </div>
        )}

        {(reg.status === 'proof_submitted' || reg.status === 'pending_approval') && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
            <div>
              <p className="font-semibold text-gray-900">
                {reg.status === 'pending_approval'
                  ? "You're registered!"
                  : 'We got your payment screenshot!'}
              </p>
              <p className="text-sm text-gray-600 mt-1">What happens next?</p>
              <ol className="mt-2 space-y-1 text-sm text-gray-600 list-decimal list-inside">
                <li>
                  {isFree
                    ? 'The organizer will review your registration.'
                    : 'The organizer will review your payment.'}
                </li>
                <li>
                  We will send your ticket to <span className="font-medium">{reg.attendees.find((a) => a.isLead)?.email ?? 'your email'}</span>.
                </li>
                <li>Your ticket will be in that email — show it at the entrance. No printing needed.</li>
              </ol>
            </div>
            {reg.proofs?.[0]?.imageUrl && (
              <Image
                src={reg.proofs[0].imageUrl}
                alt="Submitted proof"
                width={600}
                height={288}
                className="w-full object-contain rounded-lg border border-blue-200 bg-white"
                style={{ maxHeight: '18rem' }}
              />
            )}
          </div>
        )}

        {reg.status === 'verified' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-sm text-green-800 space-y-2">
            <p className="font-semibold">
              {isFree ? 'Registration approved!' : 'Payment approved!'}
            </p>
            <p className="text-green-700">
              Your QR ticket has been sent to your email. Open My Tickets to view it anytime.
            </p>
            <p className="text-green-700 text-xs">
              Can&apos;t find the email? Check your spam or promotions folder.
            </p>
          </div>
        )}

        {/* Cancel */}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full py-3 rounded-xl border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {cancelling ? 'Cancelling…' : 'Cancel My Registration'}
          </button>
        )}
      </div>
    </main>
  );
}
