'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import BackButton from '@/components/BackButton';
import Link from 'next/link';
import { formatShortDate } from '@axon-tickets/utils';

interface Order {
  id: string;
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

interface OrdersResponse {
  data: Order[];
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
};

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [eventId, setEventId] = useState('');

  const filtersApplied = !!statusFilter && !!eventId;

  const { data: events } = useQuery<EventOption[]>({
    queryKey: ['admin-events-tx'],
    queryFn: () =>
      api
        .get<{ data: { data: EventOption[] } }>('/admin/events?limit=100')
        .then((r) => r.data.data.data),
  });

  const { data, isLoading } = useQuery<OrdersResponse>({
    queryKey: ['admin-orders', page, statusFilter, eventId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (eventId) params.set('eventId', eventId);
      return api
        .get<{ data: OrdersResponse }>(`/admin/orders?${params}`)
        .then((r) => r.data.data);
    },
    enabled: filtersApplied,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

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
              Audit trail of all transactions. Select a status and event to view records.
            </p>
          </div>
          <a
            href={`${(process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1')}/admin/orders/export${eventId ? `?eventId=${eventId}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-primary hover:underline border border-primary px-4 py-2 rounded-xl"
          >
            ↓ Export CSV
          </a>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
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
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Event <span className="text-red-500">*</span>
            </label>
            <select
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[240px]"
              value={eventId}
              onChange={(e) => { setEventId(e.target.value); setPage(1); }}
            >
              <option value="">Select event…</option>
              {events?.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
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
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.data.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{order.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{order.userName}</p>
                        <p className="text-xs text-gray-400">{order.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{order.eventTitle}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        ₱{(order.total / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatShortDate(new Date(order.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline text-xs">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data?.data.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No orders found</td>
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
