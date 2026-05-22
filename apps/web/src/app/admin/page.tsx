'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { formatShortDate } from '@axon-tickets/utils';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['draft', 'published', 'on_sale', 'sold_out', 'cancelled', 'completed'];

function statusStyle(s: string) {
  if (s === 'on_sale') return 'bg-green-100 text-green-700';
  if (s === 'sold_out') return 'bg-violet-100 text-violet-700';
  if (s === 'cancelled') return 'bg-red-100 text-red-600';
  if (s === 'completed') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-500';
}

interface Event {
  id: string;
  slug: string;
  title: string;
  venue: string;
  city: string;
  startsAt: string;
  status: string;
  ticketsSold: number;
}

interface DashboardStats {
  totalRegistrations: number;
  paidOrders: number;
  pendingOrders: number;
  checkedInTickets: number;
  verifiedRegistrations: number;
  pendingRegistrations: number;
  checkedInAttendees: number;
  totalCheckedIn: number;
  grossRevenue: number;
}

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-events'],
    queryFn: () =>
      api.get<{ data: { data: Event[] } }>('/admin/events').then((r) => r.data.data.data),
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['admin-dashboard-stats'],
    queryFn: () =>
      api.get<{ data: DashboardStats }>('/admin/analytics/dashboard').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/admin/events/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-events'] });
      const previous = queryClient.getQueryData<Event[]>(['admin-events']);
      queryClient.setQueryData<Event[]>(['admin-events'], (old) =>
        old?.map((e) => (e.id === id ? { ...e, status } : e)) ?? []
      );
      return { previous };
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin-events'], ctx.previous);
      toast.error('Failed to update status');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-events'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${id}`),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Event[]>(['admin-events'], (old) => old?.filter((e) => e.id !== id) ?? []);
      toast.success('Event deleted');
    },
    onError: () => toast.error('Failed to delete event'),
  });

  const fmtRevenue = (n: number) =>
    `₱${(n / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <Link
            href="/admin/events/new"
            className="bg-primary text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-primary-hover transition-colors"
          >
            + New Event
          </Link>
        </div>

        {/* Metrics cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {[
              { label: 'Total Sold', value: stats.totalRegistrations, color: 'text-indigo-700' },
              { label: 'Paid Orders', value: stats.paidOrders, color: 'text-green-700' },
              { label: 'Pending Payment', value: stats.pendingOrders, color: 'text-yellow-700' },
              { label: 'Pending Verif.', value: stats.pendingRegistrations, color: stats.pendingRegistrations > 0 ? 'text-amber-600' : 'text-gray-400' },
              { label: 'Checked In', value: stats.totalCheckedIn, color: 'text-blue-700' },
              { label: 'Gross Revenue', value: fmtRevenue(stats.grossRevenue), color: 'text-gray-900' },
            ].map((m) => (
              <div key={m.label} className="bg-white shadow rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{m.label}</p>
                <p className={`text-2xl font-extrabold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-8">
          {[
            { href: '/admin/events', label: 'Manage Events' },
            { href: '/admin/verifications', label: 'Verifications Queue' },
            { href: '/admin/registrations', label: 'Verify Registrations' },
            { href: '/admin/checkin', label: 'Check-In Scanner' },
            { href: '/admin/orders', label: 'View Orders' },
            { href: '/admin/attendees', label: 'Attendees' },
            { href: '/admin/analytics', label: 'Analytics' },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white shadow rounded-2xl p-5 text-center font-semibold text-gray-800 hover:shadow-md transition-shadow"
            >
              {card.label}
            </Link>
          ))}
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Events</h2>
        {isLoading && <p className="text-gray-400">Loading…</p>}
        <div className="space-y-3">
          {data?.map((event) => (
            <div key={event.id} className="flex items-center justify-between bg-white shadow rounded-2xl p-4">
              <div>
                <p className="font-semibold text-gray-900">{event.title}</p>
                <p className="text-sm text-gray-500">
                  {formatShortDate(new Date(event.startsAt))} · {event.venue}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{event.ticketsSold} sold</span>
                <select
                  value={event.status}
                  onChange={(e) => statusMutation.mutate({ id: event.id, status: e.target.value })}
                  disabled={statusMutation.isPending}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${statusStyle(event.status)}`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <Link href={`/admin/events/${event.id}`} className="text-sm text-primary hover:underline">
                  Edit
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${event.title}"?\n\nThis permanently removes the event and all its data. This cannot be undone.`)) {
                      deleteMutation.mutate(event.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
