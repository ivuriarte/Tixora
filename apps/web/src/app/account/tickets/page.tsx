'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { formatShortDate, formatManila } from '@axon-tickets/utils';
import type { RegistrationSummary, RegistrationStatus } from '@axon-tickets/types';

interface Ticket {
  id: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  eventImageUrl?: string | null;
  tierName: string;
  status: string;
}

const REG_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: 'Pending Payment',
  proof_submitted: 'Proof Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const REG_STATUS_COLORS: Record<RegistrationStatus, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  proof_submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function MyTicketsPage() {
  const [tab, setTab] = useState<'tickets' | 'registrations'>('tickets');

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => api.get<{ data: { data: Ticket[] } }>('/tickets').then((r) => r.data.data.data),
  });

  const { data: registrations, isLoading: regsLoading } = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () =>
      api.get('/registrations/my').then((r) => {
        const body = r.data;
        return (body?.data?.items ?? body?.items ?? []) as RegistrationSummary[];
      }),
  });

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      active ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`;

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-5">My Events</h1>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          <button className={tabClass(tab === 'tickets')} onClick={() => setTab('tickets')}>
            🎫 Tickets
          </button>
          <button className={tabClass(tab === 'registrations')} onClick={() => setTab('registrations')}>
            📋 Registrations
          </button>
        </div>

        {/* ── Tickets tab ── */}
        {tab === 'tickets' && (
          <>
            {ticketsLoading && <p className="text-gray-400 text-sm">Loading tickets…</p>}

            {!ticketsLoading && (!tickets || tickets.length === 0) && (
              <div className="text-center py-20 text-gray-400 space-y-3">
                <p className="text-lg font-medium text-gray-500">No tickets yet</p>
                <p className="text-sm">Complete a checkout to see your QR tickets here.</p>
                <Link href="/" className="text-primary hover:underline text-sm">Browse events →</Link>
              </div>
            )}

            <div className="space-y-4">
              {tickets?.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/account/tickets/${ticket.id}`}
                  className="flex items-center gap-4 bg-white shadow-sm hover:shadow-md rounded-2xl p-4 transition-shadow border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{ticket.eventTitle}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {formatShortDate(new Date(ticket.eventStartsAt))} · {ticket.eventVenue}
                    </p>
                    <p className="text-sm text-gray-400">{ticket.tierName}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                      ticket.status === 'valid'
                        ? 'bg-green-100 text-green-700'
                        : ticket.status === 'used'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {ticket.status === 'valid' ? 'Valid' : ticket.status === 'used' ? 'Used' : ticket.status}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ── Registrations tab ── */}
        {tab === 'registrations' && (
          <>
            {regsLoading && <p className="text-gray-400 text-sm">Loading registrations…</p>}

            {!regsLoading && (!registrations || registrations.length === 0) && (
              <div className="text-center py-20 text-gray-400 space-y-3">
                <p className="text-lg font-medium text-gray-500">No registrations yet</p>
                <p className="text-sm">Register for an event to see your status here.</p>
                <Link href="/" className="text-primary hover:underline text-sm">Browse events →</Link>
              </div>
            )}

            <div className="space-y-4">
              {registrations?.map((reg) => (
                <Link
                  key={reg.id}
                  href={`/registrations/${reg.id}`}
                  className="block bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{reg.eventTitle}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatManila(new Date(reg.eventStartsAt))} · {reg.eventVenue}
                      </p>
                      {reg.tierName && (
                        <p className="text-xs text-gray-400 mt-0.5">{reg.tierName} × {reg.attendeeCount}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${REG_STATUS_COLORS[reg.status]}`}>
                        {REG_STATUS_LABELS[reg.status]}
                      </span>
                      <p className="text-sm font-semibold text-gray-900 mt-2">₱{reg.total.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 font-mono">{reg.referenceNumber}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
