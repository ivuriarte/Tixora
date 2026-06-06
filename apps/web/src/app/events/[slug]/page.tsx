import { createHmac } from 'node:crypto';
import Navbar from '@/components/Navbar';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { formatManila } from '@axon-tickets/utils';
import RegistrationGuard from '@/components/RegistrationGuard';
import VenueMap from '@/components/VenueMap';
import DescriptionSection from '@/components/DescriptionSection';

interface Tier {
  id: string;
  name: string;
  price: number;
  availableQuantity: number;
  totalQuantity: number;
  maxPerOrder: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

interface AgendaItem { time: string; title: string; description?: string; }
interface Sponsor { name: string; logoUrl?: string; tier?: string; }
interface Faq { question: string; answer: string; }

interface Event {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  address?: string | null;
  landmark?: string | null;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  startsAt: string;
  endsAt?: string | null;
  imageUrl?: string | null;
  status: string;
  maxPerUser: number;
  tiers: Tier[];
  // Conference fields
  speakerName?: string | null;
  agenda?: AgendaItem[] | null;
  sponsors?: Sponsor[] | null;
  faqs?: Faq[] | null;
  // Payment
  allowManualPayment?: boolean;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  gcashNumber?: string | null;
  paymentMethods?: Array<{
    type: string;
    name?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
  }> | null;
}

async function getEvent(slug: string): Promise<Event | null> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1');
  try {
    const res = await fetch(`${baseUrl}/events/${slug}`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) });
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

/**
 * Build the signed URL for the server-side Mapbox map-image proxy.
 * The signature (HMAC-SHA256 truncated to 16 hex chars) prevents external parties
 * from using this endpoint to geocode arbitrary strings at our expense.
 * When MAP_IMAGE_SIGNING_SECRET is not set the URL is returned unsigned — acceptable
 * for local dev but not recommended in production.
 */
function buildMapSrc(
  venue: string,
  city: string,
  address?: string | null,
  lat?: number | null,
  lng?: number | null,
): string {
  let base = `/api/map-image?venue=${encodeURIComponent(venue)}&city=${encodeURIComponent(city)}`;
  if (address) base += `&address=${encodeURIComponent(address)}`;
  // If explicit coordinates provided, add them (map route will skip geocoding)
  if (lat != null && lng != null) {
    base += `&lat=${lat}&lng=${lng}`;
  }
  const secret = process.env.MAP_IMAGE_SIGNING_SECRET;
  if (!secret) return base;
  const sig = createHmac('sha256', secret)
    .update(`${venue}:${city}`)
    .digest('hex')
    .slice(0, 16);
  return `${base}&sig=${sig}`;
}

// Sanitize JSON list fields — DB may contain malformed entries (e.g. arrays-of-arrays
// from older create flows). Treat each item as a plain object with string fields only.
function sanitizeList<T extends object>(raw: unknown, requiredKeys: (keyof T)[]): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is T => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    return requiredKeys.every((k) => {
      const v = (item as Record<string, unknown>)[k as string];
      return typeof v === 'string' && v.trim().length > 0;
    });
  });
}

export default async function EventPage({ params, searchParams }: { params: { slug: string }; searchParams: { preview?: string } }) {
  const event = await getEvent(params.slug);
  if (!event) notFound();

  const isPreview = searchParams.preview === '1';
  const isSoldOut = event.status === 'sold_out';
  const isCancelled = event.status === 'cancelled';

  const agenda = sanitizeList<AgendaItem>(event.agenda, ['title']);
  const sponsors = sanitizeList<Sponsor>(event.sponsors, ['name']);
  const faqs = sanitizeList<Faq>(event.faqs, ['question', 'answer']);

  return (
    <>
      <Navbar />
      <main className="page-container py-10">
        {isPreview && (
          <div className="mb-6 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-amber-800">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm font-medium">Admin Preview — registration is disabled</span>
            </div>
            <a href="/admin/event-previews" className="text-sm text-amber-700 hover:underline font-medium">← Back to Event Previews</a>
          </div>
        )}
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">
          {/* Left: Details */}
          <div className="lg:col-span-2 space-y-8">
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
                <span className="inline-block mb-3 bg-violet-100 text-violet-700 text-sm font-semibold px-3 py-1 rounded-full">
                  Sold Out
                </span>
              )}
              <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
              {event.speakerName && (
                <p className="mt-2 text-lg text-purple-700 font-medium">{event.speakerName}</p>
              )}
            </div>

            {event.description && <DescriptionSection description={event.description} />}

            {/* Location map */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Location</h2>
              <VenueMap
                mapSrc={buildMapSrc(event.venue, event.city, event.address, event.latitude, event.longitude)}
                venue={event.venue}
                address={event.address}
                city={event.city}
              />
            </div>

            {/* Agenda */}
            {agenda.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Program / Agenda</h2>
                <div className="space-y-3">
                  {agenda.map((item, i) => (
                    <div key={i} className="flex gap-4 p-4 bg-violet-50 rounded-xl">
                      {item.time && (
                        <div className="text-primary font-bold text-sm whitespace-nowrap min-w-[80px]">{item.time}</div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{item.title}</p>
                        {item.description && <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sponsors */}
            {sponsors.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Sponsors &amp; Partners</h2>
                <div className="flex flex-wrap gap-6 items-center">
                  {sponsors.map((s, i) => (
                    <div key={i} className="text-center">
                      {s.logoUrl ? (
                        <div className="flex items-center justify-center bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm h-16 min-w-[100px]">
                          <Image src={s.logoUrl} alt={s.name} width={120} height={40} className="h-10 w-auto object-contain" unoptimized />
                        </div>
                      ) : (
                        <span className="inline-block bg-gray-100 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm">{s.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FAQs */}
            {faqs.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
                <div className="space-y-3">
                  {faqs.map((faq, i) => (
                    <details key={i} className="group bg-gray-50 rounded-xl">
                      <summary className="flex justify-between items-center cursor-pointer p-4 font-medium text-gray-900 select-none">
                        {faq.question}
                        <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">{faq.answer}</div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Date/venue info + registration */}
          <div className="mt-8 lg:mt-0 space-y-4">
            {/* Date & venue card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Date</p>
                  <p className="font-semibold mt-1">{formatManila(new Date(event.startsAt))}</p>
                  {event.endsAt && (
                    <p className="text-xs text-gray-500 mt-0.5">to {formatManila(new Date(event.endsAt))}</p>
                  )}
                </div>
                <div>
                  <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">City</p>
                  <p className="font-semibold mt-1">{event.city}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Venue</p>
                  <p className="font-semibold mt-1">{event.venue}</p>
                  {event.address && (
                    <p className="text-xs text-gray-500 mt-0.5">{event.address}</p>
                  )}
                </div>
                {event.landmark && (
                  <div className="col-span-2">
                    <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Landmark</p>
                    <p className="font-semibold mt-1">{event.landmark}</p>
                  </div>
                )}
              </div>
            </div>
            <RegistrationGuard
              eventId={event.id}
              eventSlug={event.slug}
              tiers={event.tiers}
              maxPerUser={event.maxPerUser}
              useManualPayment={!!(event.paymentMethods?.length || event.allowManualPayment)}
              bankName={event.bankName ?? null}
              gcashNumber={event.gcashNumber ?? null}
              paymentMethods={event.paymentMethods ?? null}
              disabled={isPreview || isSoldOut || isCancelled}
            />
          </div>
        </div>
      </main>
    </>
  );
}

