import Navbar from '@/components/Navbar';
import EventCard from '@/components/EventCard';
import Link from 'next/link';
import Image from 'next/image';

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
  speakerName?: string | null;
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string }> | null;
}

// Hardcoded default featured event (Netflix-style hero).
// The "Register Now" CTA links to /events/{slug} — seed this slug in admin
// (or update FEATURED_EVENT.slug below) for a working registration flow.
const FEATURED_EVENT = {
  slug: 'francis-kong-leadership-talk',
  speakerName: 'Francis Kong',
  title: 'Lead With Purpose: A Night With Francis Kong',
  tagline: 'AN EXCLUSIVE SPEAKING ENGAGEMENT',
  description:
    "Spend an inspiring evening with one of the Philippines' most sought-after motivational speakers. Francis Kong shares timeless lessons on leadership, character, and building a life of meaning — drawn from four decades of business and ministry.",
  date: 'Saturday, June 21, 2026',
  time: '7:00 PM',
  venue: 'SMX Convention Center',
  city: 'Pasay City',
  imageUrl: '/featured/francis-kong.png',
  priceFrom: '₱1,500',
};

async function getEvents(page = 1): Promise<{ data: EventSummary[]; meta: { total: number; totalPages: number } }> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1');
  try {
    const res = await fetch(`${baseUrl}/events?page=${page}&limit=12`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { data: [], meta: { total: 0, totalPages: 0 } };
    const json = await res.json();
    // TransformInterceptor wraps: { success, data: { data: [...], meta } }
    return json.data ?? json;
  } catch {
    return { data: [], meta: { total: 0, totalPages: 0 } };
  }
}

async function getFeaturedEvent(slug: string): Promise<EventSummary | null> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1');
  try {
    const res = await fetch(`${baseUrl}/events/${slug}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

export default async function HomePage({ searchParams }: { searchParams: { page?: string } }) {
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
          <Navbar />
          <main>
            {/* Hero */}
            <section className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml,%3Csvg width=60 height=60 viewBox=0 0 60 60 xmlns=http://www.w3.org/2000/svg%3E%3Cg fill=none fill-rule=evenodd%3E%3Cg fill=%23fff fill-opacity=1%3E%3Cpath d=M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
              <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
                <div className="max-w-2xl">
                  {featured.speakerName && (
                    <p className="text-purple-300 font-semibold uppercase tracking-widest text-sm mb-4">
                      Featuring {featured.speakerName}
                    </p>
                  )}
                  <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
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
                        className="inline-flex items-center gap-2 bg-white text-purple-900 font-bold px-8 py-4 rounded-xl text-lg hover:bg-purple-50 transition-colors shadow-lg"
                      >
                        {isSoldOut ? 'View Event' : 'Register Now'}
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </Link>
                      {isSoldOut && (
                        <span className="inline-flex items-center bg-primary text-white font-bold px-6 py-4 rounded-xl text-lg">
                          Sold Out
                        </span>
                      )}
                    </div>
                  )}
                  {isCancelled && (
                    <span className="inline-flex items-center bg-red-500 text-white font-bold px-6 py-4 rounded-xl text-lg">
                      Event Cancelled
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Sponsors */}
            {Array.isArray(featured.sponsors) && featured.sponsors.length > 0 && (
              <section className="border-b border-gray-200 bg-gray-50 py-8">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                  <p className="text-center text-sm font-medium text-gray-400 uppercase tracking-widest mb-6">Presented by</p>
                  <div className="flex flex-wrap justify-center items-center gap-8">
                    {featured.sponsors.map((s, i) => (
                      <div key={i} className="text-center">
                        {s.logoUrl ? (
                          <Image src={s.logoUrl} alt={s.name} width={120} height={40} className="h-10 w-auto object-contain mx-auto" />
                        ) : (
                          <span className="text-gray-700 font-semibold text-lg">{s.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* CTA + Event detail link */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
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

  // Marketplace mode (Netflix-style: featured hero + event rows)
  const page = parseInt(searchParams.page ?? '1', 10) || 1;
  const { data: events, meta } = enableMarketplace
    ? await getEvents(page)
    : { data: [], meta: { total: 0, totalPages: 0 } };

  return (
    <>
      <Navbar />
      <main className="bg-gray-50 min-h-screen">
        {/* Netflix-style featured hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
          {/* Background portrait — right side, faded into gradient */}
          <div className="absolute inset-y-0 right-0 w-full md:w-3/5 lg:w-1/2 opacity-60 md:opacity-90">
            <Image
              src={FEATURED_EVENT.imageUrl}
              alt={FEATURED_EVENT.speakerName}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover object-right-top"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent md:via-slate-950/40" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 lg:py-40">
            <div className="max-w-2xl">
              <p className="text-amber-400 font-bold uppercase tracking-[0.2em] text-xs md:text-sm mb-5">
                {FEATURED_EVENT.tagline}
              </p>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] mb-5 tracking-tight">
                {FEATURED_EVENT.title}
              </h1>
              <p className="text-purple-200 text-lg font-semibold mb-6">
                Featuring {FEATURED_EVENT.speakerName}
              </p>
              <p className="text-slate-300 text-base md:text-lg leading-relaxed mb-8 max-w-xl">
                {FEATURED_EVENT.description}
              </p>

              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300 mb-10">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{FEATURED_EVENT.date} · {FEATURED_EVENT.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{FEATURED_EVENT.venue}, {FEATURED_EVENT.city}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                  <span>From {FEATURED_EVENT.priceFrom}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/events/${FEATURED_EVENT.slug}`}
                  className="inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-8 py-3.5 rounded-lg text-base hover:bg-slate-100 transition-colors shadow-lg"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Register Now
                </Link>
                <Link
                  href={`/events/${FEATURED_EVENT.slug}`}
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur text-white font-semibold px-8 py-3.5 rounded-lg text-base hover:bg-white/20 transition-colors border border-white/20"
                >
                  More Info
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming events */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Upcoming Events</h2>
              <p className="text-gray-500 mt-1 text-sm">Find and book tickets to the best events in the Philippines</p>
            </div>
            {meta.total > 0 && (
              <p className="text-xs text-gray-400 hidden sm:block">
                {meta.total} event{meta.total === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {events.length === 0 ? (
            <div className="text-center py-20 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
              No additional events at this time. Check back soon.
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
                <Link href={`/?page=${page - 1}`} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:border-gray-400 transition-colors">
                  ← Previous
                </Link>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">
                Page {page} of {meta.totalPages}
              </span>
              {page < meta.totalPages && (
                <Link href={`/?page=${page + 1}`} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:border-gray-400 transition-colors">
                  Next →
                </Link>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
