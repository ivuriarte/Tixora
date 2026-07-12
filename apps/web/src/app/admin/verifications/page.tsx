'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import api from '@/lib/api';
const VerificationDrawer = dynamic(
  () => import('@/components/admin/VerificationDrawer'),
  { ssr: false, loading: () => <div className="animate-pulse h-full bg-gray-50" aria-hidden="true" /> },
);
import { formatManila } from '@axon-tickets/utils';

interface VerificationRow {
  id: string;
  referenceNumber: string;
  status: string;
  tierName: string | null;
  attendeeCount: number;
  total: number;
  currency: string;
  eventTitle: string;
  eventSlug: string;
  leadName: string;
  leadEmail: string;
  hasProof: boolean;
  proofStatus: string | null;
  createdAt: string;
}

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ListResponse {
  data: VerificationRow[];
  meta: PageMeta;
}

interface EventOption {
  id: string;
  title: string;
}

function unwrap<T>(res: { data: T | { data: T } }): T {
  const body = res.data as T | { data: T };
  if (body && typeof body === 'object' && 'data' in (body as object) && 'meta' in (body as object)) {
    return body as T;
  }
  if (body && typeof body === 'object' && 'data' in (body as object)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

const STATUSES = [
  { value: 'pending_approval', label: 'Awaiting review' },
  { value: 'proof_submitted',  label: 'Proof submitted' },
  { value: 'pending_payment',  label: 'Pending payment' },
  { value: 'verified',         label: 'Verified' },
  { value: 'rejected',         label: 'Rejected' },
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; chip: string }> = {
  pending_approval: { label: 'Awaiting Review',       dot: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20' },
  proof_submitted:  { label: 'Under Review',          dot: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20' },
  verified:         { label: 'Verified',              dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  rejected:         { label: 'Rejected',              dot: 'bg-red-500',     chip: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' },
  pending_payment:  { label: 'Pending Payment',       dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' },
};

export default function VerificationsQueuePage() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [eventId, setEventId] = useState<string>('');
  const [status, setStatus] = useState<string>('pending_approval');
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const [dateError, setDateError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // Bulk reject modal state
  const REJECT_REASONS = useMemo(
    () => [
      'Amount does not match',
      'Proof is unreadable / blurry',
      'Wrong account / recipient',
      'Duplicate proof',
      'Other',
    ] as const,
    [],
  );
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectChoice, setBulkRejectChoice] = useState<string>(REJECT_REASONS[0]);
  const [bulkRejectCustom, setBulkRejectCustom] = useState('');

  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get('/admin/events?limit=100');
      const body = unwrap<{ data: Array<{ id: string; title: string }> } | Array<{ id: string; title: string }>>(res);
      const list = Array.isArray(body) ? body : body.data;
      setEvents(list.map((e) => ({ id: e.id, title: e.title })));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchRows = useCallback(async () => {
    if (!eventId) {
      setRows([]);
      setMeta({ total: 0, page: 1, limit: 50, totalPages: 0 });
      setLoading(false);
      return;
    }
    // Validate range
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('Date From must be on or before Date To.');
      setRows([]);
      setLoading(false);
      return;
    }
    setDateError(null);
    setLoading(true);
    // Clear stale rows immediately to avoid showing previous event's data
    setRows([]);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      params.set('eventId', eventId);
      if (status) params.set('status', status);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('page', String(page));
      params.set('limit', '50');
      const res = await api.get(`/admin/verifications?${params.toString()}`);
      const body = unwrap<ListResponse>(res);
      setRows(body.data);
      setMeta(body.meta);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [eventId, status, page, dateFrom, dateTo]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Close drawer whenever the filter set changes — the open registration may
  // belong to a different event/status and would be stale.
  useEffect(() => {
    setDrawerOpen(false);
    setDrawerId(null);
  }, [eventId, status, dateFrom, dateTo]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const eligible = rows.filter((r) => r.status === 'proof_submitted' || r.status === 'pending_approval').map((r) => r.id);
    if (eligible.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.slice(0, 20)));
    }
  };

  const eligibleCount = rows.filter((r) => r.status === 'proof_submitted' || r.status === 'pending_approval').length;
  const selectedEligible = rows.filter((r) => (r.status === 'proof_submitted' || r.status === 'pending_approval') && selected.has(r.id)).length;

  // Drawer navigation across eligible rows
  const navIds = rows.map((r) => r.id);
  const drawerIndex = drawerId ? navIds.indexOf(drawerId) : -1;
  const hasPrev = drawerIndex > 0;
  const hasNext = drawerIndex >= 0 && drawerIndex < navIds.length - 1;

  const openDrawer = (id: string) => {
    setDrawerId(id);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerId(null);
  };
  const drawerPrev = () => {
    if (hasPrev) setDrawerId(navIds[drawerIndex - 1]);
  };
  const drawerNext = () => {
    if (hasNext) setDrawerId(navIds[drawerIndex + 1]);
  };

  const bulkReject = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (ids.length > 20) {
      toast.error('Bulk actions are limited to 20 registrations at a time. Deselect some and try again.');
      return;
    }
    const finalReason = bulkRejectChoice === 'Other' ? bulkRejectCustom.trim() : bulkRejectChoice;
    if (finalReason.length < 5) {
      toast.error('Reason must be at least 5 characters.');
      return;
    }
    setBulkBusy(true);
    const tid = toast.loading(`Rejecting ${ids.length}…`);
    try {
      const res = await api.post('/admin/verifications/bulk-reject', { ids, reason: finalReason });
      const body = unwrap<{ message: string; results: Array<{ id: string; ok: boolean; error?: string }> }>(res);
      const succeeded = body.results.filter((r) => r.ok).length;
      const failed = body.results.length - succeeded;
      if (failed === 0) {
        toast.success(`${succeeded} registration${succeeded === 1 ? '' : 's'} rejected — notification emails sent.`, { id: tid });
      } else {
        toast.error(`Partial: ${succeeded} rejected, ${failed} could not be processed. Retry the failed items.`, { id: tid });
      }
      setBulkRejectOpen(false);
      setBulkRejectChoice(REJECT_REASONS[0]);
      setBulkRejectCustom('');
      await fetchRows();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Bulk reject failed.', { id: tid });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction Verification Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select an event to review registrations awaiting approval.{' '}
              {meta.total > 0 && <span className="font-medium">{meta.total} total</span>}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Event <span className="text-red-500">*</span>
            </label>
            <select
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[260px]"
            >
              <option value="">Select an event…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
          </div>
          {(dateFrom || dateTo) && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg border border-transparent"
              >
                Clear dates
              </button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            {selected.size > 0 && (
              <span className="text-xs text-gray-500">{selected.size} selected</span>
            )}
            <button
              onClick={() => {
                if (selectedEligible === 0) return;
                setBulkRejectChoice(REJECT_REASONS[0]);
                setBulkRejectCustom('');
                setBulkRejectOpen(true);
              }}
              disabled={bulkBusy || selectedEligible === 0}
              className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-40"
            >
              Bulk reject ({selectedEligible})
            </button>
          </div>
        </div>
        {dateError && (
          <p className="text-xs text-red-600 -mt-3 ml-1">{dateError}</p>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          {!eventId ? (
            <p className="text-sm text-gray-500 p-10 text-center">
              Select an event above to load its transaction verification queue.
            </p>
          ) : loading ? (
            <p className="text-sm text-gray-400 p-6">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 p-6">No registrations match these filters.</p>
          ) : (
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 w-10">
                    {(status === 'proof_submitted' || status === 'pending_approval') && (
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={eligibleCount > 0 && eligibleCount <= 20 && selectedEligible === eligibleCount}
                        onChange={toggleAll}
                      />
                    )}
                  </th>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Buyer</th>
                  <th className="px-4 py-3 text-left">Tier / Qty</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Submitted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const eligible = r.status === 'proof_submitted' || r.status === 'pending_approval';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {eligible && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                            disabled={!selected.has(r.id) && selected.size >= 20}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-primary">{r.referenceNumber}</td>
                      <td className="px-4 py-3">{r.eventTitle}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.leadName}</div>
                        <div className="text-xs text-gray-500">{r.leadEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {r.tierName ?? '—'} × {r.attendeeCount}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ₱{Number(r.total).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20' };
                          return (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.chip}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatManila(new Date(r.createdAt))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDrawer(r.id)}
                          className="text-xs text-primary hover:underline font-semibold"
                        >
                          {eligible ? 'Review →' : 'View →'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-gray-500">
              Page {meta.page} / {meta.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Drawer for proof review */}
      <VerificationDrawer
        open={drawerOpen}
        registrationId={drawerId}
        onClose={closeDrawer}
        onPrev={drawerPrev}
        onNext={drawerNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        currentIndex={drawerIndex}
        totalCount={navIds.length}
        onActionComplete={() => {
          void fetchRows();
        }}
      />

      {/* Bulk reject modal */}
      {bulkRejectOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            onClick={() => !bulkBusy && setBulkRejectOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Reject {selectedEligible} registration{selectedEligible === 1 ? '' : 's'}?</h2>
              <p className="text-sm text-gray-500 mt-1">
                The selected buyers will be notified with the reason you choose below.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Reason</label>
              <select
                value={bulkRejectChoice}
                onChange={(e) => setBulkRejectChoice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {REJECT_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {bulkRejectChoice === 'Other' && (
                <input
                  autoFocus
                  type="text"
                  value={bulkRejectCustom}
                  onChange={(e) => setBulkRejectCustom(e.target.value)}
                  maxLength={500}
                  placeholder="Describe the reason (min 5 chars)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkRejectOpen(false)}
                disabled={bulkBusy}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={bulkReject}
                disabled={bulkBusy}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {bulkBusy ? 'Rejecting…' : `Reject ${selectedEligible}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
