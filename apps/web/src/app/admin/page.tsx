'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import ConfirmModal from '@/components/ConfirmModal';
import Link from 'next/link';
import { formatShortDate } from '@axon-tickets/utils';
import toast from 'react-hot-toast';

// completed is auto-only — never in the dropdown
const STATUS_OPTIONS = ['draft', 'on_sale', 'sold_out', 'cancelled'];

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

  type ConfirmState = {
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning';
    onConfirm: () => void;
  } | null;
  const [dialog, setDialog] = useState<ConfirmState>(null);

  // Live date — set on client to avoid hydration mismatch
  const [today, setToday] = useState('');
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    );
  }, []);

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
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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
      <ConfirmModal
        open={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel}
        variant={dialog?.variant ?? 'danger'}
        onConfirm={() => { dialog?.onConfirm(); setDialog(null); }}
        onCancel={() => setDialog(null)}
      />
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
          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              {
                label: 'Total Revenue As Of:',
                value: fmtRevenue(stats.grossRevenue),
                color: 'text-gray-900',
              },
              {
                label: 'Total Tickets Sold As Of:',
                value: stats.totalRegistrations.toLocaleString(),
                color: 'text-indigo-700',
              },
            ].map((m) => (
              <div key={m.label} className="bg-white shadow rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-widest">{m.label}</p>
                <p className="text-xs text-gray-500 mb-1 tabular-nums">{today}</p>
                <p className={`text-2xl font-extrabold ${m.color}`}>{m.value}</p>
                <p className="text-xs text-gray-400 mt-1">Completed events only</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick-access navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
          {[
            {
              href: '/admin/events',
              label: 'Event History',
              description: 'View all past & active events',
              icon: (
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              ),
            },
            {
              href: '/admin/verifications',
              label: 'Verification Queue',
              description: 'Review pending payment proofs',
              icon: (
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              ),
            },
            {
              href: '/admin/checkin',
              label: 'Check-In Scanner',
              description: 'Scan attendee QR codes at the door',
              icon: (
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5ZM13.5 14.625c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5ZM13.5 19.875c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5ZM18.75 14.625c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5ZM18.75 19.875c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5Z" />
                </svg>
              ),
            },
            {
              href: '/admin/orders',
              label: 'Transactions',
              description: 'Browse all orders & registrations',
              icon: (
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                </svg>
              ),
            },
            {
              href: '/admin/attendees',
              label: 'Attendees',
              description: 'Manage all event attendees',
              icon: (
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              ),
            },
            {
              href: '/admin/analytics',
              label: 'Real Time Analytics',
              description: 'Live stats & revenue insights',
              icon: (
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              ),
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group bg-white shadow rounded-2xl p-5 flex items-start gap-4 border border-transparent hover:border-violet-200 hover:shadow-md transition-all"
            >
              <div className="shrink-0 p-2.5 bg-violet-50 rounded-xl group-hover:bg-violet-100 transition-colors">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-primary transition-colors text-sm">
                  {item.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.description}</p>
              </div>
              <svg
                className="shrink-0 w-4 h-4 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-0.5"
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
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
                {event.status === 'completed' ? (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusStyle(event.status)}`}>
                    completed
                  </span>
                ) : (
                  <select
                    value={event.status}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      if (newStatus === 'cancelled') {
                        setDialog({
                          title: `Cancel "${event.title}"?`,
                          message: "This will mark the event as cancelled. Customers won't be able to purchase new tickets.",
                          confirmLabel: 'Yes, cancel event',
                          variant: 'warning',
                          onConfirm: () => statusMutation.mutate({ id: event.id, status: 'cancelled' }),
                        });
                        return;
                      }
                      statusMutation.mutate({ id: event.id, status: newStatus });
                    }}
                    disabled={statusMutation.isPending}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${statusStyle(event.status)}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                )}
                <Link href={`/admin/events/${event.id}`} className="text-sm text-primary hover:underline">
                  Edit
                </Link>
                <button
                  onClick={() => {
                    setDialog({
                      title: `Delete "${event.title}"?`,
                      message: 'This permanently removes the event and all its data. This cannot be undone.',
                      confirmLabel: 'Delete event',
                      variant: 'danger',
                      onConfirm: () => deleteMutation.mutate(event.id),
                    });
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
