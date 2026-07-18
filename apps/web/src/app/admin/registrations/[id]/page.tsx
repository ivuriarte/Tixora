'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatManila, formatPHP } from '@axon-tickets/utils';
import { ErrorState, ScreenSkeleton } from '@/components/ScreenState';

interface ProofRow {
  id: string;
  imageUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface AdminReg {
  id: string;
  referenceNumber: string;
  status: string;
  tierName: string | null;
  attendeeCount: number;
  subtotal: string | number;
  fees: string | number;
  discount: string | number;
  referralCodeSnapshot?: { code?: string } | null;
  total: string | number;
  currency: string;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  event: { title: string; slug: string; startsAt: string; venue: string; address: string | null; landmark: string | null };
  user: { email: string; firstName: string | null; lastName: string | null } | null;
  attendees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    isLead: boolean;
    qrToken: string | null;
    checkedInAt: string | null;
  }>;
  proofs: ProofRow[];
  verifiedBy: { firstName: string; lastName: string } | null;
}

function unwrap<T>(res: { data: T | { data: T } }): T {
  const body = res.data as T | { data: T };
  if (body && typeof body === 'object' && 'data' in (body as object)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export default function AdminRegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reg, setReg] = useState<AdminReg | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonChoice, setReasonChoice] = useState('Amount does not match');
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const REJECT_REASONS = [
    'Amount does not match',
    'Proof is unreadable / blurry',
    'Wrong account / recipient',
    'Duplicate proof',
    'Other',
  ] as const;

  const fetchReg = useCallback(async () => {
    try {
      const res = await api.get(`/admin/registrations/${id}`);
      setReg(unwrap<AdminReg>(res));
    } catch {
      setError('This registration could not be found. The URL may be incorrect or the record has been deleted.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchReg();
  }, [fetchReg]);

  const approve = async () => {
    if (!confirm('Approve this registration and verify payment?')) return;
    setActing(true);
    setError(null);
    try {
      await api.patch(`/admin/registrations/${id}/approve`);
      await fetchReg();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Approve failed.');
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    const finalReason =
      reasonChoice === 'Other' ? reason.trim() : reasonChoice;
    if (finalReason.length < 5) {
      setError('Reason must be at least 5 characters.');
      return;
    }
    setActing(true);
    setError(null);
    try {
      await api.patch(`/admin/registrations/${id}/reject`, { reason: finalReason });
      setShowReject(false);
      setReason('');
      setReasonChoice('Amount does not match');
      await fetchReg();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Reject failed.');
    } finally {
      setActing(false);
    }
  };

  const resend = async () => {
    if (!confirm(`Resend QR code email to all ${reg?.attendees?.length ?? 'attendee(s)'}?`)) return;
    setActing(true);
    setResendStatus(null);
    setError(null);
    try {
      await api.post(`/admin/registrations/${id}/resend`);
      setResendStatus('QR tickets emailed to all attendees on this registration.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Could not resend QR emails. Please try again.');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <ScreenSkeleton rows={5} />
      </main>
    );
  }

  if (!reg) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <ErrorState
          title="Registration unavailable"
          message={error ?? 'This registration may have been removed or the link is incorrect.'}
          action={<button onClick={() => router.push('/admin/verifications')} className="axon-pill bg-primary text-xs text-white">Back to verification queue</button>}
        />
      </main>
    );
  }

  const latestProof = reg.proofs?.[0];
  const canReview = reg.status === 'proof_submitted' || reg.status === 'pending_approval';
  const lead = reg.attendees.find((a) => a.isLead) ?? reg.attendees[0] ?? null;
  const buyerName = lead
    ? `${lead.firstName} ${lead.lastName}`
    : reg.user
      ? [reg.user.firstName, reg.user.lastName].filter(Boolean).join(' ') || 'Unnamed buyer'
      : 'Walk-in attendee';
  const buyerEmail = lead?.email ?? reg.user?.email ?? '';

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/orders')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Transactions
          </button>
          <button
            onClick={() => router.push('/admin/verifications')}
            className="text-sm text-primary hover:underline"
          >
            Verify Registrations →
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-primary font-mono">{reg.referenceNumber}</p>
            <p className="text-sm text-gray-600 mt-0.5">{reg.event.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatManila(new Date(reg.event.startsAt))} · {reg.event.venue}
            </p>
            {reg.event.address && (
              <p className="text-xs text-gray-400 mt-0.5">{reg.event.address}</p>
            )}
            {reg.event.landmark && (
              <p className="text-xs text-gray-400 mt-0.5">Near: {reg.event.landmark}</p>
            )}
          </div>
          <span
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ${
              reg.status === 'verified'
                ? 'bg-green-100 text-green-700'
                : reg.status === 'proof_submitted'
                  ? 'bg-blue-100 text-blue-700'
                  : reg.status === 'rejected'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {reg.status.replace('_', ' ')}
          </span>
        </div>

        {/* Buyer */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-sm space-y-1">
          <h2 className="font-semibold text-gray-900 mb-2">Buyer</h2>
          <p>{buyerName}</p>
          <p className="text-gray-500">{buyerEmail}</p>
        </div>

        {/* Order */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-sm space-y-2">
          <h2 className="font-semibold text-gray-900 mb-2">Order</h2>
          <div className="flex justify-between text-gray-600">
            <span>
              {reg.tierName ?? 'Ticket'} × {reg.attendeeCount}
            </span>
            <span>{formatPHP(Number(reg.subtotal))}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service fee</span>
            <span>{formatPHP(Number(reg.fees))}</span>
          </div>
          {Number(reg.discount) > 0 && <div className="flex justify-between font-medium text-emerald-700"><span>Referral discount{reg.referralCodeSnapshot?.code ? ` (${reg.referralCodeSnapshot.code})` : ''}</span><span>−{formatPHP(Number(reg.discount))}</span></div>}
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span className="text-primary">{formatPHP(Number(reg.total))}</span>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Attendees</h2>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {reg.attendees.length} {reg.attendees.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="space-y-2">
            {reg.attendees.map((a, i) => {
              const hasQr = !!a.qrToken;
              const qrStatus = a.checkedInAt
                ? { label: 'Checked In', cls: 'bg-green-100 text-green-700' }
                : hasQr
                ? { label: 'QR Ready', cls: 'bg-blue-100 text-blue-700' }
                : { label: 'QR Pending', cls: 'bg-gray-100 text-gray-500' };

              return (
                <div key={a.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-gray-900 truncate">
                        {a.firstName} {a.lastName}
                      </span>
                      {a.isLead && (
                        <span className="shrink-0 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Lead
                        </span>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${qrStatus.cls}`}>
                      {qrStatus.label}
                    </span>
                  </div>
                  <div className="mt-2 pl-8 space-y-0.5 text-xs text-gray-500">
                    <p>{a.email ?? ''}</p>
                    {a.phone && <p>{a.phone}</p>}
                    {reg.tierName && (
                      <p className="font-medium text-gray-700">{reg.tierName}</p>
                    )}
                    {a.checkedInAt && (
                      <p className="text-green-600 font-medium">
                        Checked in {formatManila(new Date(a.checkedInAt))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Proof */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Payment Proof</h2>
          {!latestProof && <p className="text-sm text-gray-500">No proof submitted yet.</p>}
          {latestProof && (
            <>
              <p className="text-xs text-gray-500">
                Submitted {formatManila(new Date(latestProof.createdAt))} · status:{' '}
                <span className="font-medium">{latestProof.status}</span>
              </p>
              <Image
                src={latestProof.imageUrl}
                alt="Payment proof"
                width={600}
                height={600}
                className="w-full object-contain rounded-lg border border-gray-200 bg-gray-50"
                style={{ maxHeight: '600px' }}
              />
              <a
                href={latestProof.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Open full size ↗
              </a>
            </>
          )}
        </div>

        {/* Rejection (if any) */}
        {reg.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
            <p className="font-semibold mb-1">Rejection Reason</p>
            <p>{reg.rejectionReason}</p>
          </div>
        )}

        {reg.verifiedBy && reg.verifiedAt && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-sm text-green-800">
            <p className="font-semibold mb-1">Payment Verified</p>
            <p>Verified by {reg.verifiedBy.firstName} {reg.verifiedBy.lastName} on{' '}
            {formatManila(new Date(reg.verifiedAt))}</p>
          </div>
        )}

        {reg.status === 'verified' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">QR Delivery</h2>
            {resendStatus && <p className="text-sm text-green-600">{resendStatus}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={resend}
              disabled={acting}
              className="px-4 py-2 rounded-lg border border-primary text-primary text-sm font-semibold hover:bg-primary/5 disabled:opacity-50"
            >
              {acting ? 'Sending…' : 'Resend QR Email'}
            </button>
          </div>
        )}

        {/* Actions */}
        {canReview && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Review</h2>
            {error && <p className="text-sm text-red-600">{error}</p>}

            {!showReject ? (
              <div className="flex gap-3">
                <button
                  onClick={approve}
                  disabled={acting}
                  className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {acting ? 'Working…' : 'Approve & Verify'}
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={acting}
                  className="flex-1 py-3 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-700">Reason</label>
                <select
                  value={reasonChoice}
                  onChange={(e) => setReasonChoice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {REJECT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {reasonChoice === 'Other' && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Specify reason (min 5 chars)…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                )}
                <div className="flex gap-3">
                  <button
                    onClick={reject}
                    disabled={acting}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {acting ? 'Working…' : 'Confirm Reject'}
                  </button>
                  <button
                    onClick={() => {
                      setShowReject(false);
                      setReason('');
                      setError(null);
                    }}
                    disabled={acting}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </main>
  );
}
