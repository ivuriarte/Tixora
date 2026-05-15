import Navbar from '@/components/Navbar';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { formatManila } from '@axon-tickets/utils';
import TierSelector from '@/components/TierSelector';

interface Tier {
  id: string;
  name: string;
  price: number;
  available: number;
  totalQuantity: number;
  maxPerOrder: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

interface Event {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string;
  endsAt?: string | null;
  imageUrl?: string | null;
  status: string;
  maxPerUser: number;
  tiers: Tier[];
}

async function getEvent(slug: string): Promise<Event | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  try {
    const res = await fetch(`${baseUrl}/events/${slug}`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const event = await getEvent(params.slug);
  if (!event) return {};
  return {
    title: `${event.title} — Axon Tickets`,
    description: event.description?.slice(0, 150),
    openGraph: { title: event.title, images: event.imageUrl ? [event.imageUrl] : [] },
  };
}

export default async function EventPage({ params }: { params: { slug: string } }) {
  const event = await getEvent(params.slug);
  if (!event) notFound();

  const isSoldOut = event.status === 'sold_out';
  const isCancelled = event.status === 'cancelled';

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">
          {/* Left: Details */}
          <div className="lg:col-span-2 space-y-6">
            {event.imageUrl && (
              <div className="relative rounded-2xl overflow-hidden h-64 sm:h-80">
                <Image src={event.imageUrl} alt={event.title} fill className="object-cover" sizes="800px" />
              </div>
            )}

            <div>
              {isCancelled && (
                <span className="inline-block mb-3 bg-red-100 text-red-700 text-sm font-semibold px-3 py-1 rounded-full">
                  Event Cancelled
                </span>
              )}
              {isSoldOut && !isCancelled && (
                <span className="inline-block mb-3 bg-orange-100 text-orange-700 text-sm font-semibold px-3 py-1 rounded-full">
                  Sold Out
                </span>
              )}
              <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Date</p>
                <p className="font-medium mt-0.5">{formatManila(new Date(event.startsAt))}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Venue</p>
                <p className="font-medium mt-0.5">{event.venue}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">City</p>
                <p className="font-medium mt-0.5">{event.city}</p>
              </div>
            </div>

            {event.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">About this event</h2>
                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{event.description}</p>
              </div>
            )}
          </div>

          {/* Right: Tier selector */}
          <div className="mt-8 lg:mt-0">
            <TierSelector
              eventId={event.id}
              eventSlug={event.slug}
              maxPerUser={event.maxPerUser}
              tiers={event.tiers}
              disabled={isSoldOut || isCancelled}
            />
          </div>
        </div>
      </main>
    </>
  );
}
