import Navbar from '@/components/Navbar';
import EventCard from '@/components/EventCard';
import AdminRedirect from '@/components/AdminRedirect';
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
  slug: 'dcv-exclusive-session-with-coach-russ-juson-n0h74',
  speakerName: 'Coach Russ Juson',
  title: 'DCV EXCLUSIVE SESSION',
  subtitle: 'with Coach Russ Juson',
  tagline: 'AN EXCLUSIVE LEADERSHIP SESSION',
  description:
    "A powerful and exclusive learning session with one of the country's most respected coaches in leadership and business growth. Learn from experience. Lead with purpose. Build a legacy.",
  imageUrl: '/featured/russ-juson.png',
  date: 'Thursday, May 28, 2026',
  time: '4:00 PM – 7:00 PM',
  venue: "Seattle's Best Coffee, DGT, Matina",
  capacity: 'Limited to 40 participants',
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
          <AdminRedirect />
          <Navbar />
          <main>
            {/* Hero */}
            <section className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml,%3Csvg width=60 height=60 viewBox=0 0 60 60 xmlns=http://www.w3.org/2000/svg%3E%3Cg fill=none fill-rule=evenodd%3E%3Cg fill=%23fff fill-opacity=1%3E%3Cpath d=M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
              <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
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
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

  // Marketplace mode (Netflix-style: featured hero + event rows)
  const page = parseInt(searchParams.page ?? '1', 10) || 1;
  const { data: events, meta } = enableMarketplace
    ? await getEvents(page)
    : { data: [], meta: { total: 0, totalPages: 0 } };

  return (
    <>
      <AdminRedirect />
      <Navbar />
      <main className="bg-gray-50 min-h-screen">
        {/* Netflix-style featured hero */}
        <section className="relative overflow-hidden bg-[#0a0a0a] text-white">
          {/* Background portrait — right side, faded into gradient */}
          <div className="absolute inset-y-0 right-0 w-full md:w-3/5 lg:w-1/2 overflow-hidden">
            {/* Subtle gold glow behind speaker */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <Image
              src={FEATURED_EVENT.imageUrl}
              alt={`${FEATURED_EVENT.speakerName} — ${FEATURED_EVENT.title}`}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover object-top opacity-60 md:opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/70 to-transparent md:via-[#0a0a0a]/30" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-24">
            <div className="max-w-2xl">
              {/* DCV brand chip */}
              <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-full px-4 py-1.5 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-400 font-bold uppercase tracking-[0.2em] text-xs">
                  {FEATURED_EVENT.tagline}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight mb-2">
                {FEATURED_EVENT.title}
              </h1>
              <p className="text-amber-400 text-2xl md:text-3xl font-extrabold leading-tight mb-6">
                {FEATURED_EVENT.subtitle}
              </p>

              <p className="text-slate-300 text-base md:text-lg leading-relaxed mb-8 max-w-xl">
                {FEATURED_EVENT.description}
              </p>

              {/* Event details */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-9 text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <time>{FEATURED_EVENT.date}</time>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{FEATURED_EVENT.time}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{FEATURED_EVENT.venue}</span>
                </div>
              </div>

              {/* CTA + capacity badge */}
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href={(() => {
                    // Prefer the exact featured slug if present in the events list;
                    // fall back to the first available event; then scroll anchor.
                    const match = events.find((e) => e.slug === FEATURED_EVENT.slug);
                    if (match) return `/events/${match.slug}`;
                    if (events[0]) return `/events/${events[0].slug}`;
                    return '#upcoming-events';
                  })()}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-lg text-base transition-colors shadow-lg shadow-amber-900/30"
                >
                  Reserve Your Seat
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <span className="flex items-center gap-1.5 text-xs text-amber-200/70 border border-amber-400/20 rounded-full px-3 py-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {FEATURED_EVENT.capacity}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming events */}
        <section id="upcoming-events" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
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
