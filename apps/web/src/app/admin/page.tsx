'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { formatShortDate } from '@axon-tickets/utils';

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
  checkedIn: number;
  grossRevenue: number;
}

export default function AdminDashboardPage() {
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Registrations', value: stats.totalRegistrations, color: 'text-purple-700' },
              { label: 'Paid Orders', value: stats.paidOrders, color: 'text-green-700' },
              { label: 'Pending', value: stats.pendingOrders, color: 'text-yellow-700' },
              { label: 'Checked In', value: stats.checkedIn, color: 'text-blue-700' },
              { label: 'Gross Revenue', value: fmtRevenue(stats.grossRevenue), color: 'text-gray-900' },
            ].map((m) => (
              <div key={m.label} className="bg-white shadow rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{m.label}</p>
                <p className={`text-2xl font-extrabold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          {[
            { href: '/admin/events', label: 'Manage Events' },
            { href: '/admin/checkin', label: 'Check-In Scanner' },
            { href: '/admin/orders', label: 'View Orders' },
            { href: '/admin/attendees', label: 'Attendees' },
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
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{event.ticketsSold} sold</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  event.status === 'on_sale' ? 'bg-green-100 text-green-700' :
                  event.status === 'sold_out' ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{event.status.replace('_', ' ')}</span>
                <Link href={`/admin/events/${event.id}`} className="text-sm text-primary hover:underline">
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
