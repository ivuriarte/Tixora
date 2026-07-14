'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import ConfirmModal from '@/components/ConfirmModal';
import Link from 'next/link';
import { formatShortDate } from '@axon-tickets/utils';
import toast from 'react-hot-toast';

// completed is auto-only — never in the dropdown
const STATUS_OPTIONS = ['draft', 'on_sale', 'sold_out', 'cancelled'];
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';

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
  onsiteRegistrationEnabled?: boolean;
  ticketsSold: number;
  organization: { id: string; name: string } | null;
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
      toast.error('Status could not be updated. The change has been rolled back.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-events'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${id}`),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Event[]>(['admin-events'], (old) => old?.filter((e) => e.id !== id) ?? []);
      toast.success('Event deleted');
    },
    onError: () => toast.error('Event could not be deleted. Please try again.'),
  });

  const fmtRevenue = (n: number) =>
    `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

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
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Operations Overview</h1>
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
                {event.organization && (
                  <p className="text-xs text-violet-600 mt-0.5">by {event.organization.name}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{event.ticketsSold} sold</span>
                {event.onsiteRegistrationEnabled && (
                  <a
                    href={`${API_URL}/events/${event.slug}/onsite-registration/qr.pdf?eventId=${event.id}`}
                    className="text-sm font-semibold text-gray-900 hover:underline"
                  >
                    Download QR
                  </a>
                )}
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
