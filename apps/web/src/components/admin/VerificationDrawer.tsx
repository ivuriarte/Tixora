'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import api from '@/lib/api';
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
  createdAt: string;
  event: { title: string; slug: string; startsAt: string; venue: string };
  user: { email: string; firstName: string; lastName: string };
  attendees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isLead: boolean;
  }>;
  proofs: ProofRow[];
}

function unwrap<T>(res: { data: T | { data: T } }): T {
  const body = res.data as T | { data: T };
  if (body && typeof body === 'object' && 'data' in (body as object)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/**
 * Defense-in-depth: only render image URLs we trust (https / protocol-relative).
 * Blocks javascript:, data:, file:, etc. even if backend data is corrupted.
 */
function isSafeImageUrl(url: string | undefined | null): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('//');
}

const REJECT_REASONS = [
  'Amount does not match',
  'Proof is unreadable / blurry',
  'Wrong account / recipient',
  'Duplicate proof',
  'Other',
] as const;

const STATUS_LABELS: Record<string, string> = {
  proof_submitted: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  pending_payment: 'Pending Payment',
  cancelled: 'Cancelled',
};

interface Props {
  open: boolean;
  registrationId: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  /** Called after a successful approve/reject so parent can refetch the list. */
  onActionComplete?: () => void;
}

export default function VerificationDrawer({
  open,
  registrationId,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  totalCount,
  onActionComplete,
}: Props) {
  const [reg, setReg] = useState<AdminReg | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<string>(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [zoomed, setZoomed] = useState(false);

  // In-session cache: last viewed registrations stay hot.
  const cacheRef = useRef<Map<string, AdminReg>>(new Map());
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Monotonically increasing request token to discard stale fetch results.
  const fetchTokenRef = useRef(0);

  const fetchReg = useCallback(async (id: string) => {
    const myToken = ++fetchTokenRef.current;
    const cached = cacheRef.current.get(id);
    if (cached) {
      setReg(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/admin/registrations/${id}`);
      // Drop stale response if user navigated away.
      if (myToken !== fetchTokenRef.current) return;
      const data = unwrap<AdminReg>(res);
      cacheRef.current.set(id, data);
      // Cap cache at 10 entries.
      if (cacheRef.current.size > 10) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }
      setReg(data);
    } catch {
      if (myToken !== fetchTokenRef.current) return;
      toast.error('Failed to load registration.');
      setReg(null);
    } finally {
      if (myToken === fetchTokenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && registrationId) {
      setShowReject(false);
      setZoomed(false);
      setReasonChoice(REJECT_REASONS[0]);
      setCustomReason('');
      void fetchReg(registrationId);
    } else if (!open) {
      setReg(null);
    }
  }, [open, registrationId, fetchReg]);

  // Lock background scroll while drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Keyboard: Esc to close, J/K (or ArrowDown/Up) to navigate.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      if (e.key === 'Escape') {
        if (acting) return;
        e.preventDefault();
        onClose();
      } else if ((e.key === 'j' || e.key === 'ArrowDown') && hasNext && !acting) {
        e.preventDefault();
        onNext?.();
      } else if ((e.key === 'k' || e.key === 'ArrowUp') && hasPrev && !acting) {
        e.preventDefault();
        onPrev?.();
      }
    };
    window.addEventListener('keydown', handler);
    // Initial focus for accessibility.
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [open, hasNext, hasPrev, onClose, onNext, onPrev, acting]);

  const approve = async () => {
    if (!reg) return;
    setActing(true);
    const tid = toast.loading('Approving…');
    try {
      await api.patch(`/admin/registrations/${reg.id}/approve`);
      toast.success('Approved', { id: tid });
      cacheRef.current.delete(reg.id);
      onActionComplete?.();
      // Auto-advance if there's a next row, else close.
      if (hasNext) onNext?.();
      else onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Approve failed.', { id: tid });
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!reg) return;
    const finalReason = reasonChoice === 'Other' ? customReason.trim() : reasonChoice;
    if (finalReason.length < 5) {
      toast.error('Reason must be at least 5 characters.');
      return;
    }
    setActing(true);
    const tid = toast.loading('Rejecting…');
    try {
      await api.patch(`/admin/registrations/${reg.id}/reject`, { reason: finalReason });
      toast.success('Rejected', { id: tid });
      cacheRef.current.delete(reg.id);
      setShowReject(false);
      onActionComplete?.();
      if (hasNext) onNext?.();
      else onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Reject failed.', { id: tid });
    } finally {
      setActing(false);
    }
  };

  if (!open) return null;

  const latestProof = reg?.proofs?.[0];
  const proofImageOk = isSafeImageUrl(latestProof?.imageUrl);
  const canReview = reg?.status === 'proof_submitted';
  const lead = reg?.attendees?.find((a) => a.isLead) ?? reg?.attendees?.[0];

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Registration verification"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close drawer"
        onClick={() => { if (!acting) onClose(); }}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl ring-1 ring-black/5 flex flex-col animate-[slideIn_180ms_ease-out]">
        <style jsx>{`
          @keyframes slideIn {
            from {
              transform: translateX(24px);
              opacity: 0.6;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>

        {/* Header */}
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
              Reference
            </p>
            <p className="font-mono text-primary font-semibold truncate">
              {reg?.referenceNumber ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {totalCount != null && currentIndex != null && currentIndex >= 0 && (
              <span className="mr-2 text-xs font-semibold tabular-nums text-gray-400">
                {currentIndex + 1}
                <span className="font-normal"> / {totalCount}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev || acting}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous (K or ↑)"
              aria-label="Previous registration"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext || acting}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next (J or ↓)"
              aria-label="Next registration"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              disabled={acting}
              className="ml-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Close (Esc)"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="space-y-4">
              <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
              <div className="h-96 bg-gray-100 rounded-2xl animate-pulse" />
            </div>
          )}

          {!loading && !reg && (
            <p className="text-sm text-gray-500">Registration not available.</p>
          )}

          {!loading && reg && (
            <>
              {/* Summary */}
              <section className="rounded-2xl border border-gray-200 p-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Event</p>
                  <p className="font-medium text-gray-900">{reg.event.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatManila(new Date(reg.event.startsAt))} · {reg.event.venue}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Buyer</p>
                  <p className="font-medium text-gray-900">
                    {lead ? `${lead.firstName} ${lead.lastName}` : `${reg.user.firstName} ${reg.user.lastName}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{lead?.email ?? reg.user.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Tier / Qty</p>
                  <p className="font-medium text-gray-900">
                    {reg.tierName ?? 'Ticket'} × {reg.attendeeCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Amount Due</p>
                  <p className="font-bold text-primary text-lg leading-tight">
                    {formatPHP(centavosToPeso(Number(reg.total)))}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Subtotal {formatPHP(centavosToPeso(Number(reg.subtotal)))} ·
                    Fee {formatPHP(centavosToPeso(Number(reg.fees)))}
                  </p>
                </div>
              </section>

              {/* Proof */}
              <section className="rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Payment Proof</h3>
                  {latestProof && (
                    <span className="text-xs text-gray-500">
                      Submitted {formatManila(new Date(latestProof.createdAt))}
                    </span>
                  )}
                </div>
                {!latestProof ? (
                  <p className="text-sm text-gray-500 italic">No proof submitted.</p>
                ) : !proofImageOk ? (
                  <p className="text-sm text-red-600">
                    Proof URL is invalid or unsafe and will not be displayed. Please ask the buyer to re-upload.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setZoomed(true)}
                      className="block w-full rounded-xl border border-gray-200 bg-gray-50 overflow-hidden hover:ring-2 hover:ring-primary/40 transition"
                      aria-label="Zoom proof image"
                    >
                      <Image
                        src={latestProof.imageUrl}
                        alt="Payment proof"
                        width={600}
                        height={520}
                        loading="lazy"
                        className="w-full object-contain"
                        style={{ maxHeight: '520px' }}
                      />
                    </button>
                    <div className="flex items-center gap-3 text-xs">
                      <a
                        href={latestProof.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Open full size ↗
                      </a>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">Click image to zoom</span>
                    </div>
                  </>
                )}
              </section>

              {/* Status / actions */}
              {!canReview && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                  Current status: <span className="font-semibold">{STATUS_LABELS[reg.status] ?? reg.status}</span>
                  {reg.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {reg.rejectionReason}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {reg && canReview && (
          <footer className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-3">
            {showReject ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Reason</label>
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
                  <input
                    autoFocus
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    maxLength={500}
                    placeholder="Describe the reason (min 5 chars)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReject(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={reject}
                    disabled={acting}
                    className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {acting ? 'Rejecting…' : 'Confirm reject'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  disabled={acting}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={approve}
                  disabled={acting}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {acting ? 'Approving…' : hasNext ? 'Approve & Next →' : 'Approve ✓'}
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-400 text-center">
              Approve / Reject auto-advances to next · <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> navigate · <kbd className="font-mono">Esc</kbd> close
            </p>
          </footer>
        )}
      </div>

      {/* Zoom overlay */}
      {zoomed && latestProof && proofImageOk && (
        <button
          type="button"
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          aria-label="Close zoom"
        >
          <div className="relative w-full h-full">
            <Image
              src={latestProof.imageUrl}
              alt="Payment proof full size"
              fill
              className="object-contain"
            />
          </div>
        </button>
      )}
    </div>
  );
}
