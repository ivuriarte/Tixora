'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { formatManila, centavosToPeso, formatPHP } from '@axon-tickets/utils';

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
  total: string | number;
  currency: string;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  event: { title: string; slug: string; startsAt: string; venue: string };
  user: { email: string; firstName: string; lastName: string };
  attendees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    isLead: boolean;
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
      setError('Registration not found.');
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
    if (!confirm('Resend QR code email to lead attendee?')) return;
    setActing(true);
    setResendStatus(null);
    setError(null);
    try {
      await api.post(`/admin/registrations/${id}/resend`);
      setResendStatus('QR email resent.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Resend failed.');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-gray-400">Loading…</p>
        </main>
      </>
    );
  }

  if (!reg) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-gray-500">{error ?? 'Not found.'}</p>
          <button
            onClick={() => router.push('/admin/registrations')}
            className="mt-4 text-sm text-primary hover:underline"
          >
            ← Back
          </button>
        </main>
      </>
    );
  }

  const latestProof = reg.proofs?.[0];
  const canReview = reg.status === 'proof_submitted';

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <button
          onClick={() => router.push('/admin/registrations')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Verify Registrations
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-primary font-mono">{reg.referenceNumber}</p>
            <p className="text-sm text-gray-600 mt-0.5">{reg.event.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatManila(new Date(reg.event.startsAt))} · {reg.event.venue}
            </p>
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
          <p>
            {reg.user.firstName} {reg.user.lastName}
          </p>
          <p className="text-gray-500">{reg.user.email}</p>
        </div>

        {/* Order */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-sm space-y-2">
          <h2 className="font-semibold text-gray-900 mb-2">Order</h2>
          <div className="flex justify-between text-gray-600">
            <span>
              {reg.tierName ?? 'Ticket'} × {reg.attendeeCount}
            </span>
            <span>{formatPHP(centavosToPeso(Number(reg.subtotal)))}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service fee</span>
            <span>{formatPHP(centavosToPeso(Number(reg.fees)))}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span className="text-primary">{formatPHP(centavosToPeso(Number(reg.total)))}</span>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Attendees</h2>
          <div className="divide-y divide-gray-100">
            {reg.attendees.map((a) => (
              <div key={a.id} className="py-2 text-sm">
                <span className="font-medium">
                  {a.firstName} {a.lastName}
                </span>
                {a.isLead && (
                  <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Lead
                  </span>
                )}
                <p className="text-gray-500 text-xs">{a.email}</p>
              </div>
            ))}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latestProof.imageUrl}
                alt="Payment proof"
                className="w-full max-h-[600px] object-contain rounded-lg border border-gray-200 bg-gray-50"
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
            Verified by {reg.verifiedBy.firstName} {reg.verifiedBy.lastName} on{' '}
            {formatManila(new Date(reg.verifiedAt))}
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
    </>
  );
}
