'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import Image from 'next/image';
import { formatShortDate } from '@axon-tickets/utils';

interface EventSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string;
  imageUrl?: string | null;
  lowestPrice?: number | null;
  status: string;
}

function statusBadge(status: string) {
  if (status === 'on_sale') return 'bg-green-100 text-green-700';
  if (status === 'sold_out') return 'bg-violet-100 text-violet-700';
  if (status === 'cancelled') return 'bg-red-100 text-red-600';
  if (status === 'draft') return 'bg-yellow-100 text-yellow-700';
  if (status === 'completed') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-500';
}

export default function EventPreviewsPage() {
  const { data, isLoading } = useQuery<EventSummary[]>({
    queryKey: ['admin-event-previews'],
    queryFn: () =>
      api.get('/admin/events?limit=100').then((r: any) => r.data?.data?.data ?? []),
  });

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Event Previews</h1>
            <p className="text-gray-500 mt-1">
              Browse all events as a customer would see them. Registration is disabled in preview mode.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white shadow animate-pulse">
                <div className="h-44 bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-2/3 bg-gray-200 rounded" />
                  <div className="h-4 w-full bg-gray-200 rounded" />
                  <div className="h-3 w-1/2 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && data?.length === 0 && (
          <div className="text-center py-20 text-gray-400">No events found.</div>
        )}

        {!isLoading && data && data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {data.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}?preview=1`}
                className="group block rounded-2xl overflow-hidden bg-white shadow hover:shadow-md transition-shadow"
              >
                <div className="relative h-44 bg-gray-200">
                  {event.imageUrl ? (
                    <Image
                      src={event.imageUrl}
                      alt={event.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, 400px"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-violet-50 text-primary text-4xl font-bold select-none">
                      {event.title[0]}
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusBadge(event.status)}`}>
                    {event.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
                    {formatShortDate(new Date(event.startsAt))} · {event.city}
                  </p>
                  <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-primary transition-colors">
                    {event.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">{event.venue}</p>
                  {event.lowestPrice != null && event.lowestPrice > 0 && (
                    <p className="mt-2 text-sm font-semibold text-primary">
                      From ₱{event.lowestPrice.toLocaleString()}
                    </p>
                  )}
                  {(event.lowestPrice === 0 || event.lowestPrice == null) && (
                    <p className="mt-2 text-sm font-semibold text-primary">Free</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
