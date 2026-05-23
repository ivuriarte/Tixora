'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';

interface AdminEvent {
  id: string;
  title: string;
  startsAt: string;
}

interface RegistrationRow {
  id: string;
  referenceNumber: string;
  status: string;
  tierName: string | null;
  attendeeCount: number;
  total: number;
  leadName: string;
  leadEmail: string;
  hasProof: boolean;
  proofStatus: string | null;
  createdAt: string;
}

const STATUS_FILTERS = [
  { value: 'proof_submitted', label: 'Awaiting Review' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

export default function AdminRegistrationsPage() {
  const [eventId, setEventId] = useState<string>('');
  const [status, setStatus] = useState<string>('proof_submitted');

  const { data: events } = useQuery({
    queryKey: ['admin-events-for-reg'],
    queryFn: () =>
      api
        .get<{ data: { data: AdminEvent[] } }>('/admin/events?limit=100')
        .then((r) => r.data.data.data),
  });

  const { data: regs, isLoading } = useQuery({
    queryKey: ['admin-registrations', eventId, status],
    queryFn: () =>
      api
        .get<{ data: { data: RegistrationRow[] } }>(
          `/admin/events/${eventId}/registrations${status ? `?status=${status}` : ''}`,
        )
        .then((r) => r.data.data.data),
    enabled: !!eventId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Verify Registrations</h1>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to dashboard
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          >
            <option value="">— Select event —</option>
            {events?.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {!eventId && (
          <p className="text-gray-500 text-sm">Pick an event to view registrations.</p>
        )}

        {eventId && isLoading && (
          <div className="bg-white shadow rounded-2xl overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="px-4 py-4 border-b border-gray-100 last:border-0">
                <div className="h-4 bg-gray-100 rounded animate-pulse-soft" />
              </div>
            ))}
          </div>
        )}

        {eventId && regs && regs.length === 0 && (
          <p className="text-gray-500 text-sm">No registrations match the filter.</p>
        )}

        <div className="space-y-3">
          {regs?.map((r) => (
            <Link
              key={r.id}
              href={`/admin/registrations/${r.id}`}
              className="flex items-center justify-between bg-white shadow-sm rounded-2xl p-4 hover:shadow-md transition-shadow"
            >
              <div>
                <p className="font-mono text-sm font-semibold text-primary">
                  {r.referenceNumber}
                </p>
                <p className="text-sm text-gray-700 mt-0.5">
                  {r.leadName} · {r.leadEmail}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.tierName} × {r.attendeeCount} · ₱{r.total.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {r.hasProof && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    proof: {r.proofStatus}
                  </span>
                )}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
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
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
