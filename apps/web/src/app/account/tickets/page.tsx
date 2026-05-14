'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { formatShortDate } from '@tixora/utils';

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

export default function MyTicketsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => api.get<{ data: { data: Ticket[] } }>('/tickets').then((r) => r.data.data.data),
  });

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Tickets</h1>

        {isLoading && <p className="text-gray-400">Loading tickets…</p>}

        {!isLoading && (!data || data.length === 0) && (
          <div className="text-center py-20 text-gray-400 space-y-3">
            <p>No tickets yet.</p>
            <Link href="/" className="text-primary hover:underline text-sm">Browse events →</Link>
          </div>
        )}

        <div className="space-y-4">
          {data?.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/account/tickets/${ticket.id}`}
              className="flex items-center gap-4 bg-white shadow hover:shadow-md rounded-2xl p-4 transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{ticket.eventTitle}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatShortDate(new Date(ticket.eventStartsAt))} · {ticket.eventVenue}
                </p>
                <p className="text-sm text-gray-500">{ticket.tierName}</p>
              </div>
              <div className="shrink-0">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    ticket.status === 'valid'
                      ? 'bg-green-100 text-green-700'
                      : ticket.status === 'used'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-red-100 text-red-600'
                  }`}
                >
                  {ticket.status === 'valid' ? 'Valid' : ticket.status === 'used' ? 'Used' : ticket.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
