import { createHmac } from 'node:crypto';
import Navbar from '@/components/Navbar';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { formatManila } from '@axon-tickets/utils';
import RegistrationGuard from '@/components/RegistrationGuard';
import VenueMap from '@/components/VenueMap';
import DescriptionSection from '@/components/DescriptionSection';
import EventFunnelTracker from '@/components/EventFunnelTracker';

interface Tier {
  id: string;
  name: string;
  price: number;
  inclusions?: Array<{ id?: string; label: string; stubEnabled?: boolean; sortOrder?: number }>;
  availableQuantity: number;
  totalQuantity: number;
  maxPerOrder: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

interface AgendaItem { time: string; title: string; description?: string; }
interface Sponsor { name: string; logoUrl?: string; tier?: string; websiteUrl?: string; description?: string; isVisible?: boolean; }
interface Faq { question: string; answer: string; }
interface CustomSection { title: string; description: string; imageUrl?: string; imageAlt?: string; isVisible?: boolean; }

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
  createdAt: string;
  imageUrl?: string | null;
  status: string;
  maxPerUser: number;
  tiers: Tier[];
  isFree?: boolean;
  // Conference fields
  speakerName?: string | null;
  agenda?: AgendaItem[] | null;
  sponsors?: Sponsor[] | null;
  faqs?: Faq[] | null;
  customSections?: CustomSection[] | null;
  organizerName?: string | null;
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
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1');
  try {
    const res = await fetch(`${baseUrl}/events/${slug}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
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
  const description = event.description?.slice(0, 150);
  const canonical = `/events/${event.slug}`;
  return {
    title: `${event.title} — Axon Tickets`,
    description,
    alternates: { canonical },
    openGraph: {
      title: event.title,
      description,
      type: 'website',
      url: canonical,
      images: event.imageUrl ? [{ url: event.imageUrl, alt: event.title }] : ['/og-image.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description,
      images: event.imageUrl ? [event.imageUrl] : ['/og-image.png'],
    },
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
  const siteUrl = process.env.NEXT_PUBLIC_APP_ENV === 'uat'
    ? 'https://uat.axontickets.online'
    : 'https://axontickets.online';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description,
    startDate: event.startsAt,
    endDate: event.endsAt ?? event.startsAt,
    eventStatus: isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: `${siteUrl}/events/${event.slug}`,
    image: [event.imageUrl ?? `${siteUrl}/og-image.png`],
    location: {
      '@type': 'Place',
      name: event.venue,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address ?? event.venue,
        addressLocality: event.city,
        addressCountry: 'PH',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: event.organizerName ?? 'Axon Tickets',
      url: siteUrl,
    },
    offers: event.tiers.map((tier) => ({
      '@type': 'Offer',
      name: tier.name,
      price: event.isFree ? 0 : tier.price,
      priceCurrency: 'PHP',
      availability: tier.availableQuantity > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
      url: `${siteUrl}/events/${event.slug}`,
      validFrom: tier.saleStartsAt ?? event.createdAt,
    })),
  };
  // JSON-LD must be emitted as raw JSON. Escaping '<' prevents organizer-controlled
  // text from closing the script element and creating an HTML injection sink.
  const serializedJsonLd = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  const agenda = sanitizeList<AgendaItem>(event.agenda, ['title']);
  const tierOrder = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Partner', 'Media Partner', 'Community Partner'];
  const sponsors = sanitizeList<Sponsor>(event.sponsors, ['name'])
    .filter((s) => s.isVisible !== false)
    .map((s, index) => ({ ...s, originalIndex: index }))
    .sort((a, b) => {
      const rankA = a.tier ? tierOrder.indexOf(a.tier) : tierOrder.length;
      const rankB = b.tier ? tierOrder.indexOf(b.tier) : tierOrder.length;
      return (rankA < 0 ? tierOrder.length : rankA) - (rankB < 0 ? tierOrder.length : rankB) || a.originalIndex - b.originalIndex;
    });
  const faqs = sanitizeList<Faq>(event.faqs, ['question', 'answer']);
  const customSections = sanitizeList<CustomSection>(event.customSections, ['title', 'description']).filter((section) => section.isVisible !== false);

  return (
    <>
      <Navbar />
      <main className="page-container py-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializedJsonLd }} />
        <EventFunnelTracker eventId={event.id} eventSlug={event.slug} eventTitle={event.title} />
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
                latitude={event.latitude}
                longitude={event.longitude}
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
                <h2 className="text-lg font-semibold text-gray-900 mb-6 text-center">Sponsors &amp; Partners</h2>
                {(() => {
                  const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze'];
                  const TIER_HEIGHT: Record<string, string> = {
                    platinum: 'h-24',
                    gold: 'h-16',
                    silver: 'h-12',
                    bronze: 'h-10',
                  };
                  const grouped = sponsors.reduce<Record<string, Sponsor[]>>((acc, s) => {
                    const key = s.tier?.toLowerCase() ?? '__none__';
                    (acc[key] ??= []).push(s);
                    return acc;
                  }, {});
                  const sortedKeys = Object.keys(grouped).sort((a, b) => {
                    if (a === '__none__') return 1;
                    if (b === '__none__') return -1;
                    const ai = TIER_ORDER.indexOf(a);
                    const bi = TIER_ORDER.indexOf(b);
                    if (ai === -1 && bi === -1) return a.localeCompare(b);
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                  });
                  return sortedKeys.map((tierKey) => {
                    const tierSponsors = grouped[tierKey];
                    const tierLabel = tierKey === '__none__' ? null : tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
                    const logoHeight = TIER_HEIGHT[tierKey] ?? 'h-16';
                    return (
                      <div key={tierKey} className="mb-8 last:mb-0">
                        {tierLabel && (
                          <div className="flex items-center gap-3 mb-5">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400">{tierLabel}</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-center gap-8">
                          {tierSponsors.map((s, i) => {
                            const logo = s.logoUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={s.logoUrl} alt={`${s.name} logo`} loading="lazy" decoding="async" className={`${logoHeight} w-auto max-w-[280px] object-contain grayscale opacity-60 transition-all duration-200 hover:grayscale-0 hover:opacity-100`} />
                            ) : (
                              <span className="text-sm font-semibold text-gray-500">{s.name}</span>
                            );
                            return (
                              <div key={i} className="flex items-center justify-center">
                                {s.websiteUrl ? (
                                  <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${s.name}`}>{logo}</a>
                                ) : logo}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {customSections.map((section, index) => (
              <section key={`${section.title}-${index}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {section.imageUrl && (
                  <div className="aspect-[16/7] overflow-hidden">
                    {/* External organizer asset; deliberately not proxied by next/image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={section.imageUrl} alt={section.imageAlt || section.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-5 sm:p-6"><h2 className="text-xl font-bold text-gray-900">{section.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-600">{section.description}</p></div>
              </section>
            ))}

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
              {event.organizerName && (
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <p className="text-gray-400 uppercase tracking-wide text-xs font-medium mb-1">Organizer</p>
                  <p className="font-semibold text-gray-900 text-sm">{event.organizerName}</p>
                </div>
              )}
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
              eventTitle={event.title}
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
