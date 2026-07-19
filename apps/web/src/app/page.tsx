import type { Metadata } from 'next';
import { Suspense } from 'react';
import Navbar from '@/components/Navbar';
import EventCard from '@/components/EventCard';
import AdminRedirect from '@/components/AdminRedirect';
import FeaturedHeroCarousel from '@/components/FeaturedHeroCarousel';
import OrganizerCtaSection from '@/components/OrganizerCtaSection';
import HowItWorksSection from '@/components/marketing/HowItWorksSection';
import TrustSection from '@/components/marketing/TrustSection';
import EventCategoryCards from '@/components/marketing/EventCategoryCards';
import Footer from '@/components/marketing/Footer';
import { iconPaths } from '@/components/marketing/icons';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description:
    'Axon Tickets helps organizers create event pages, manage registrations, send QR codes, and run smoother events in the Philippines.',
};

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
  isFree?: boolean;
  status: string;
  speakerName?: string | null;
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string; websiteUrl?: string }> | null;
}


// Returns null on fetch failure so the UI can distinguish "error" from "no events yet"
async function getEvents(page = 1, query = ''): Promise<{ data: EventSummary[]; meta: { total: number; totalPages: number } } | null> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1');
  try {
    const params = new URLSearchParams({ page: String(page), limit: '12' });
    if (query) params.set('q', query);
    const res = await fetch(`${baseUrl}/events?${params.toString()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    // TransformInterceptor wraps: { success, data: { data: [...], meta } }
    return json.data ?? json;
  } catch {
    return null;
  }
}

async function getFeaturedEvent(slug: string): Promise<EventSummary | null> {
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

interface FeaturedApiEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  speakerName?: string | null;
  tagline?: string | null;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string | null;
  imageUrl?: string | null;
  status: string;
  lowestPrice?: number | null;
  isFree?: boolean;
  totalAvailable?: number;
  maxCapacity?: number | null;
  featuredOrder?: number | null;
}

async function getFeaturedEvents(): Promise<FeaturedApiEvent[]> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1');
  try {
    const res = await fetch(`${baseUrl}/events/featured`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    // TransformInterceptor wraps: { success, data: [...] }
    const data = json.data ?? json;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function HomePage({ searchParams }: { searchParams: { page?: string; q?: string } }) {
  const featuredSlug = process.env.NEXT_PUBLIC_FEATURED_EVENT_SLUG;
  const enableMarketplace = process.env.NEXT_PUBLIC_ENABLE_MARKETPLACE !== 'false';

  // Conference mode: show landing page for the featured event
  if (featuredSlug) {
    const featured = await getFeaturedEvent(featuredSlug);
    if (featured) {
      const eventDate = new Date(featured.startsAt).toLocaleDateString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const eventTime = new Date(featured.startsAt).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Manila',
      });
      const isSoldOut = featured.status === 'sold_out';
      const isCancelled = featured.status === 'cancelled';

      return (
        <>
          <AdminRedirect />
          <Navbar />
          <main>
            {/* Hero */}
            <section className="overflow-hidden bg-[#1a0533] text-white">
              <div className="page-container py-20 md:py-28">
                <div className="max-w-2xl">
                  {featured.speakerName && (
                    <p className="text-purple-300 font-semibold uppercase tracking-widest text-sm mb-4">
                      Featuring {featured.speakerName}
                    </p>
                  )}
                  <h1 className="axon-display mb-6 text-5xl md:text-7xl">
                    {featured.title}
                  </h1>
                  {featured.description && (
                    <p className="text-purple-100 text-lg leading-relaxed mb-8 line-clamp-3">
                      {featured.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-6 text-sm text-purple-200 mb-10">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span>{eventDate} · {eventTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span>{featured.venue}, {featured.city}</span>
                    </div>
                  </div>
                  {!isCancelled && (
                    <div className="flex flex-wrap gap-4">
                      <Link
                        href={`/events/${featured.slug}`}
                        className="axon-pill gap-2 bg-white text-sm text-[#1a0533] hover:bg-[#ede9fe]"
                      >
                        {isSoldOut ? 'View Event' : 'Register Now'}
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </Link>
                      {isSoldOut && (
                        <span className="axon-pill bg-primary text-sm text-white">
                          Sold Out
                        </span>
                      )}
                    </div>
                  )}
                  {isCancelled && (
                    <span className="axon-pill bg-red-600 text-sm text-white">
                      Event Cancelled
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Sponsors */}
            {Array.isArray(featured.sponsors) && featured.sponsors.length > 0 && (
              <section className="border-b border-gray-200 bg-gray-50 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <p className="text-center text-sm font-medium text-gray-400 uppercase tracking-widest mb-6">Presented by</p>
                  <div className="flex flex-wrap justify-center items-center gap-8">
                    {featured.sponsors.map((s, i) => {
                      const inner = s.logoUrl ? (
                        <div className="flex items-center justify-center bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm h-16 min-w-[100px] transition-opacity hover:opacity-80">
                          <Image src={s.logoUrl} alt={s.name} width={120} height={40} className="h-10 w-auto object-contain mx-auto" />
                        </div>
                      ) : (
                        <span className="text-gray-700 font-semibold text-lg hover:underline">{s.name}</span>
                      );
                      return (
                        <div key={i} className="text-center">
                          {s.websiteUrl ? (
                            <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${s.name}`}>
                              {inner}
                            </a>
                          ) : inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* CTA + Event detail link */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Secure your seat today</h2>
              <p className="text-gray-500 mb-8 max-w-xl mx-auto">
                Limited seats available. Register now to confirm your attendance and receive your QR ticket by email.
              </p>
              {!isCancelled && !isSoldOut && (
                <Link
                  href={`/events/${featured.slug}`}
                  className="inline-flex items-center gap-2 bg-primary text-white font-bold px-10 py-4 rounded-xl text-lg hover:bg-primary-hover transition-colors"
                >
                  Get Your Ticket
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </Link>
              )}
            </section>
          </main>
        </>
      );
    }
  }

  // Marketplace mode: brand hero + featured carousel + event grid + marketing sections
  const page = parseInt(searchParams.page ?? '1', 10) || 1;
  const query = searchParams.q?.trim().slice(0, 120) ?? '';
  const featuredEvents = await getFeaturedEvents();

  return (
    <>
      <AdminRedirect />
      <Navbar />
      <main className="min-h-screen bg-white">
        <FeaturedHeroCarousel events={featuredEvents} />

        <EventTrustBar />

        {/* Upcoming events */}
        <section id="upcoming-events" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 scroll-mt-20">
          <Suspense fallback={<EventsGridSkeleton />}>
            <EventsGrid page={page} query={query} enableMarketplace={enableMarketplace} />
          </Suspense>
        </section>

        <HowItWorksSection />

        <TrustSection
          heading="Everything you need to run an event"
          subheading="All of this is live on the platform today."
          features={homeFeatures}
          background="white"
        />

        <EventCategoryCards />

        {/* ── Become an Organizer CTA (hidden for authenticated users) ── */}
        <OrganizerCtaSection
          heading="Ready to run your next event with Axon Tickets?"
          buttonLabel="Start Organizing"
          dataTrack="homepage-start-organizing"
        />
      </main>
      <Footer />
    </>
  );
}

const homeFeatures = [
  { title: 'Public event pages', description: 'Every event gets a shareable page with details, agenda, and sponsors.', iconPath: iconPaths.eventPage },
  { title: 'Online registration', description: 'Attendees register from any device in a few taps.', iconPath: iconPaths.registration },
  { title: 'OTP email verification', description: 'Registrations are verified by a one-time code, so attendee lists stay real.', iconPath: iconPaths.otp },
  { title: 'QR code tickets', description: 'Confirmed attendees receive a unique QR ticket by email.', iconPath: iconPaths.ticket },
  { title: 'QR check-in validation', description: 'Scan tickets at the door and catch invalid or reused codes.', iconPath: iconPaths.checkin },
  { title: 'Email confirmations', description: 'Confirmations and tickets are sent automatically — no manual follow-ups.', iconPath: iconPaths.email },
  { title: 'Organizer dashboard', description: 'Manage events, registrations, and check-ins from one place.', iconPath: iconPaths.dashboard },
  { title: 'Payment proof collection', description: 'Collect GCash or bank transfer proof and verify it before issuing tickets.', iconPath: iconPaths.paymentProof },
  { title: 'Attendee records & reports', description: 'A complete record of who registered and who showed up.', iconPath: iconPaths.reports },
];

function EventTrustBar() {
  const items = [
    {
      label: 'Verified organizers',
      icon: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    },
    {
      label: 'Secure payments',
      icon: <><rect x="5" y="9" width="14" height="11" rx="2" /><path d="M8 9V7a4 4 0 0 1 8 0v2M12 13v3" /></>,
    },
    {
      label: 'Instant QR tickets',
      icon: <><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6V7Z" /><path d="M12 8v8" /></>,
    },
  ];

  return (
    <section aria-label="Why book with Axon Tickets" className="border-b border-[#e8e1f2] bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-[#ece6f4] px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-center gap-3 px-5 py-5 text-sm font-semibold text-[#2d1748] sm:py-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3edff] text-primary">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">{item.icon}</svg>
            </span>
            {item.label}
          </div>
        ))}
      </div>
    </section>
  );
}

async function EventsGrid({ page, query, enableMarketplace }: { page: number; query: string; enableMarketplace: boolean }) {
  const result = enableMarketplace ? await getEvents(page, query) : { data: [], meta: { total: 0, totalPages: 0 } };

  if (!result) {
    return (
      <>
        <EventsGridHeader query={query} />
        <div className="axon-card px-6 py-20 text-center text-[#6b5b8a]">
          <p className="axon-display text-2xl text-[#1a0533]">Couldn&apos;t load events</p>
          <p className="mt-3">Check your connection and refresh to try again.</p>
        </div>
      </>
    );
  }

  const { data: events, meta } = result;

  return (
    <>
      <EventsGridHeader total={meta.total} query={query} />

      {events.length === 0 ? (
        <div className="axon-card px-6 py-20 text-center">
          <p className="axon-display text-2xl text-[#1a0533]">{query ? 'No matching events' : 'No events yet'}</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-[#6b5b8a]">{query ? `We couldn't find an event, venue or city matching “${query}”.` : 'New events are added every week. Check back soon — or host your own.'}</p>
          <Link href={query ? '/' : '/become-organizer'} className="axon-pill mt-6 bg-primary text-xs text-white hover:bg-primary-hover">
            {query ? 'Clear Search' : 'Apply as Organizer'}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-10">
          {page > 1 && (
            <Link href={`/?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ''}#upcoming-events`} className="axon-pill border border-[#d8cdee] text-xs text-[#1a0533] hover:border-primary">
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-gray-500">
            Page {page} of {meta.totalPages}
          </span>
          {page < meta.totalPages && (
            <Link href={`/?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ''}#upcoming-events`} className="axon-pill border border-[#d8cdee] text-xs text-[#1a0533] hover:border-primary">
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function EventsGridHeader({ total, query = '' }: { total?: number; query?: string }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h2 className="axon-display text-3xl text-[#1a0533] md:text-4xl">{query ? 'Search Results' : 'Upcoming Events'}</h2>
        <p className="mt-2 text-sm text-[#6b5b8a]">{query ? `Events matching “${query}”` : 'Find and book tickets to the best events in the Philippines'}</p>
      </div>
      {total != null && total > 0 && (
        <p className="text-xs text-gray-400 hidden sm:block">
          {total} event{total === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

function EventsGridSkeleton() {
  return (
    <>
      <EventsGridHeader />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="axon-card overflow-hidden">
            <div className="h-44 animate-pulse bg-[#ece4fb]" />
            <div className="p-4 space-y-2">
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
