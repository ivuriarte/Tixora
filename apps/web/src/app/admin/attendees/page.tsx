'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import BackButton from '@/components/BackButton';

interface Attendee {
  id: string;
  userEmail: string;
  userName: string;
  userCompany: string | null;
  userJobTitle: string | null;
  userCity: string | null;
  userPhone: string | null;
  tierName: string;
  orderStatus: string | null;
  paymentMethod: string | null;
  status: string;
  checkedInAt: string | null;
}

interface AttendeesResponse {
  data: Attendee[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface Event {
  id: string;
  title: string;
  slug: string;
}

const PAYMENT_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
};

export default function AdminAttendeesPage() {
  const searchParams = useSearchParams();
  const initialEvent = searchParams.get('eventId') ?? '';
  const [selectedEventId, setSelectedEventId] = useState(initialEvent);
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (initialEvent && initialEvent !== selectedEventId) {
      setSelectedEventId(initialEvent);
    }
  }, [initialEvent, selectedEventId]);

  const { data: events } = useQuery<Event[]>({
    queryKey: ['admin-events-select'],
    queryFn: () =>
      api.get<{ data: { data: Event[] } }>('/admin/events?limit=100').then((r) => r.data.data.data),
  });

  const { data, isLoading } = useQuery<AttendeesResponse>({
    queryKey: ['admin-attendees', selectedEventId, searchQ, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (searchQ) params.set('q', searchQ);
      return api
        .get<{ data: AttendeesResponse }>(`/admin/events/${selectedEventId}/attendees?${params}`)
        .then((r) => r.data.data);
    },
    enabled: !!selectedEventId,
  });

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1');

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <BackButton href="/admin" label="Back to Admin" className="mb-2" />
            <h1 className="text-2xl font-bold text-gray-900">Attendees</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select an event to view its attendee roster.
            </p>
          </div>
          {selectedEventId && (
            <a
              href={`${apiBase}/admin/events/${selectedEventId}/attendees/export`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary hover:underline border border-primary px-4 py-2 rounded-xl"
            >
              ↓ Export CSV
            </a>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <select
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={selectedEventId}
            onChange={(e) => { setSelectedEventId(e.target.value); setPage(1); }}
          >
            <option value="">Select an event…</option>
            {events?.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search name, email, company…"
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary flex-1 min-w-[200px]"
          />
        </div>

        {!selectedEventId && (
          <div className="text-center py-20 text-gray-400">Select an event to view attendees.</div>
        )}

        {selectedEventId && isLoading && (
          <p className="text-gray-400">Loading…</p>
        )}

        {selectedEventId && !isLoading && (
          <>
            {data && (
              <p className="text-sm text-gray-500 mb-3">{data.meta.total} attendees</p>
            )}
            <div className="bg-white shadow rounded-2xl overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Checked In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.data.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{a.userName}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userEmail}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userCompany ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userJobTitle ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userCity ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          {a.tierName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_COLORS[a.orderStatus ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                          {a.orderStatus ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {a.status === 'used' ? (
                          <span className="text-blue-700 font-medium">✓ Yes</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data?.data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No attendees found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {data && data.meta.totalPages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <p className="text-sm text-gray-500">
                  Page {data.meta.page} of {data.meta.totalPages}
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
        )}
      </main>
    </>
  );
}
