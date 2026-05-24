'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import BackButton from '@/components/BackButton';
import Link from 'next/link';
import { formatShortDate } from '@axon-tickets/utils';

interface Transaction {
  id: string;
  source: 'order' | 'registration';
  reference: string;
  userEmail: string;
  userName: string;
  eventTitle: string;
  eventSlug: string;
  status: string;
  total: number;
  paymentMethod: string | null;
  createdAt: string;
}

interface EventOption {
  id: string;
  title: string;
}

interface TransactionsResponse {
  data: Transaction[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const SOURCE_BADGE: Record<string, string> = {
  order: 'bg-blue-50 text-blue-600',
  registration: 'bg-orange-50 text-orange-600',
};

const SOURCE_LABEL: Record<string, string> = {
  order: 'PayMongo',
  registration: 'Manual',
};

async function downloadCsv(url: string, filename: string) {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [eventId, setEventId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [exporting, setExporting] = useState(false);

  const filtersApplied = !!statusFilter && !!eventId;

  const { data: events } = useQuery<EventOption[]>({
    queryKey: ['admin-events-tx'],
    queryFn: () =>
      api
        .get<{ data: { data: EventOption[] } }>('/admin/events?limit=100')
        .then((r) => r.data.data.data),
  });

  const { data, isLoading } = useQuery<TransactionsResponse>({
    queryKey: ['admin-orders', page, statusFilter, eventId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (eventId) params.set('eventId', eventId);
      return api
        .get<{ data: TransactionsResponse }>(`/admin/orders?${params}`)
        .then((r) => r.data.data);
    },
    enabled: filtersApplied,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (eventId) params.set('eventId', eventId);
      const safeTitle = (eventTitle || events?.find((e) => e.id === eventId)?.title || 'Event').replace(/[<>:"/\\|?*]/g, '').trim();
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsv(`/admin/orders/export?${params}`, `[Transaction]${safeTitle}(${date}).csv`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <BackButton href="/admin" label="Back to Admin" className="mb-2" />
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <p className="text-sm text-gray-500 mt-1">
              All paid transactions — online (PayMongo) and manual (GCash / bank transfer).
            </p>
          </div>
          {filtersApplied && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="text-sm font-semibold text-primary hover:underline border border-primary px-4 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting…' : '↓ Export CSV'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Event <span className="text-red-500">*</span>
            </label>
            <select
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[240px]"
              value={eventId}
              onChange={(e) => { setEventId(e.target.value); setEventTitle(e.target.options[e.target.selectedIndex]?.text ?? ''); setPage(1); }}
            >
              <option value="">Select event…</option>
              {events?.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Select status…</option>
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed / Rejected</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {!filtersApplied && (
          <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-400">
            Select both a status and an event to view transactions.
          </div>
        )}

        {/* Table */}
        {filtersApplied && (isLoading ? (
          <div className="bg-white shadow rounded-2xl overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <tbody className="divide-y divide-gray-100">
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td className="px-4 py-4">
                      <div className="h-4 bg-gray-100 rounded animate-pulse-soft" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="bg-white shadow rounded-2xl overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.data.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {tx.source === 'registration' ? tx.reference : tx.reference.slice(0, 8) + '…'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{tx.userName}</p>
                        <p className="text-xs text-gray-400">{tx.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{tx.eventTitle}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SOURCE_BADGE[tx.source] ?? 'bg-gray-100 text-gray-500'}`}>
                          {SOURCE_LABEL[tx.source]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[tx.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        ₱{(tx.total / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatShortDate(new Date(tx.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        {tx.source === 'order' && (
                          <Link href={`/admin/orders/${tx.id}`} className="text-primary hover:underline text-xs">
                            View
                          </Link>
                        )}
                        {tx.source === 'registration' && (
                          <Link href={`/admin/registrations/${tx.id}`} className="text-primary hover:underline text-xs">
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data?.data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No transactions found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.meta.totalPages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <p className="text-sm text-gray-500">
                  {data.meta.total} total · page {data.meta.page} of {data.meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={!data.meta.hasPrevPage}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-4 py-2 rounded-xl text-sm border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={!data.meta.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 rounded-xl text-sm border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ))}
      </main>
    </>
  );
}
