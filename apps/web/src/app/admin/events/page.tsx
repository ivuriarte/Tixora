'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import { formatShortDate } from '@axon-tickets/utils';
import { useAuthStore } from '@/store/auth.store';

interface EventRow {
  id: string;
  slug: string;
  title: string;
  venue: string;
  startsAt: string;
  status: string;
  ticketsSold: number;
  organization: { id: string; name: string } | null;
}

interface OrganizerOption {
  id: string;
  name: string;
}

const STATUS_STYLE: Record<string, string> = {
  on_sale: 'bg-green-100 text-green-700',
  sold_out: 'bg-violet-100 text-violet-700',
  cancelled: 'bg-red-100 text-red-600',
  completed: 'bg-blue-100 text-blue-700',
  draft: 'bg-gray-100 text-gray-500',
};

export default function EventHistoryPage() {
  const { user } = useAuthStore();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-event-history', organizationId],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (organizationId) params.set('organizationId', organizationId);
      return api
        .get<{ data: { data: EventRow[] } }>(`/admin/events?${params}`)
        .then((r) => r.data.data.data);
    },
  });

  const { data: organizers } = useQuery<OrganizerOption[]>({
    queryKey: ['admin-event-history-organizers'],
    enabled: !!user?.isAdmin,
    queryFn: () =>
      api
        .get<{ data: { data: OrganizerOption[] } }>('/admin/organizers?status=approved&limit=100')
        .then((r) => r.data.data.data.map((org) => ({ id: org.id, name: org.name }))),
  });

  const filtered = (data ?? []).filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (q && !e.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Event History</h1>
            <p className="text-sm text-gray-500 mt-1">
              A log of every event with quick access to analytics, attendees, and details.
            </p>
          </div>
          <Link
            href="/admin/events/new"
            className="bg-primary text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-primary-hover transition-colors"
          >
            + New Event
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <input
            type="text"
            placeholder="Search by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary flex-1 min-w-[220px]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="on_sale">On Sale</option>
            <option value="sold_out">Sold Out</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {user?.isAdmin && (
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All organizers</option>
              {(organizers ?? []).map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          )}
        </div>

        {isLoading && <p className="text-gray-400">Loading…</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow">
            No events match these filters.
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((event) => (
            <div
              key={event.id}
              className="bg-white shadow rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900 truncate">{event.title}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      STATUS_STYLE[event.status] ?? 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {event.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  {formatShortDate(new Date(event.startsAt))} · {event.venue} ·{' '}
                  <span className="font-medium text-gray-700">{event.ticketsSold} sold</span>
                  {event.organization && <span> · {event.organization.name}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/analytics?eventId=${event.id}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  Analytics
                </Link>
                <Link
                  href={`/admin/attendees?eventId=${event.id}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                >
                  Attendees
                </Link>
                <Link
                  href={`/admin/events/${event.id}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Details
                </Link>
              </div>
            </div>
          ))}
        </div>
    </main>
  );
}
