'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import BackButton from '@/components/BackButton';
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
  { value: 'proof_submitted', label: 'Awaiting review' },
  { value: 'pending_payment', label: 'Awaiting proof' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

export default function VerificationsQueuePage() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [eventId, setEventId] = useState<string>('');
  const [status, setStatus] = useState<string>('proof_submitted');
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
    setLoading(true);
    // Clear stale rows immediately to avoid showing previous event's data
    setRows([]);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      params.set('eventId', eventId);
      if (status) params.set('status', status);
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
  }, [eventId, status, page]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const eligible = rows.filter((r) => r.status === 'proof_submitted').map((r) => r.id);
    if (eligible.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.slice(0, 20)));
    }
  };

  const bulkApprove = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (ids.length > 20) {
      toast.error('Maximum 20 per bulk action.');
      return;
    }
    if (!confirm(`Approve ${ids.length} registration${ids.length === 1 ? '' : 's'}?`)) return;
    setBulkBusy(true);
    const tid = toast.loading(`Approving ${ids.length}…`);
    try {
      const res = await api.post('/admin/verifications/bulk-approve', { ids });
      const body = unwrap<{ message: string; results: Array<{ id: string; ok: boolean; error?: string }> }>(res);
      const succeeded = body.results.filter((r) => r.ok).length;
      const failed = body.results.length - succeeded;
      if (failed === 0) {
        toast.success(`Approved ${succeeded}`, { id: tid });
      } else {
        toast.error(`Approved ${succeeded} · ${failed} failed`, { id: tid });
      }
      await fetchRows();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Bulk approve failed.', { id: tid });
    } finally {
      setBulkBusy(false);
    }
  };

  const eligibleCount = rows.filter((r) => r.status === 'proof_submitted').length;
  const selectedEligible = rows.filter((r) => r.status === 'proof_submitted' && selected.has(r.id)).length;

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <BackButton href="/admin" label="Back to Admin" className="mb-2" />
            <h1 className="text-2xl font-bold text-gray-900">Transaction Verification Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select an event to review verified registrations with paid transactions.{' '}
              {meta.total > 0 && <span className="font-medium">{meta.total} total</span>}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
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
          <div className="ml-auto flex items-center gap-3">
            {selected.size > 0 && (
              <span className="text-xs text-gray-500">{selected.size} selected</span>
            )}
            <button
              onClick={bulkApprove}
              disabled={bulkBusy || selectedEligible === 0}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-40"
            >
              {bulkBusy ? 'Approving…' : `Bulk approve (${selectedEligible})`}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {!eventId ? (
            <p className="text-sm text-gray-500 p-10 text-center">
              Select an event above to load its transaction verification queue.
            </p>
          ) : loading ? (
            <p className="text-sm text-gray-400 p-6">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 p-6">No registrations match these filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 w-10">
                    {status === 'proof_submitted' && (
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
                  const eligible = r.status === 'proof_submitted';
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
                        ₱{(Number(r.total) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            r.status === 'verified'
                              ? 'bg-green-100 text-green-700'
                              : r.status === 'proof_submitted'
                                ? 'bg-blue-100 text-blue-700'
                                : r.status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatManila(new Date(r.createdAt))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/registrations/${r.id}`}
                          className="text-xs text-primary hover:underline font-semibold"
                        >
                          Review →
                        </Link>
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
    </>
  );
}
