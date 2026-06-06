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
  totalAvailable?: number;
  featuredOrder?: number | null;
}

async function getFeaturedEvents(): Promise<FeaturedApiEvent[]> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1');
  try {
    const res = await fetch(`${baseUrl}/events/featured`, {
      next: { revalidate: 30 },
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
                          <div className="flex items-center justify-center bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm h-16 min-w-[100px]">
                            <Image src={s.logoUrl} alt={s.name} width={120} height={40} className="h-10 w-auto object-contain mx-auto" />
                          </div>
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
  const [{ data: events, meta }, featuredEvents] = await Promise.all([
    enableMarketplace ? getEvents(page) : Promise.resolve({ data: [], meta: { total: 0, totalPages: 0 } }),
    getFeaturedEvents(),
  ]);

  // Pick the first DB-driven featured event
  const dbHero: FeaturedApiEvent | null = featuredEvents[0] ?? null;

  const heroDate = dbHero
    ? new Date(dbHero.startsAt).toLocaleDateString('en-PH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
      })
    : null;
  const heroTime = dbHero
    ? (() => {
        const start = new Date(dbHero.startsAt).toLocaleTimeString('en-PH', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
        });
        const end = dbHero.endsAt
          ? new Date(dbHero.endsAt).toLocaleTimeString('en-PH', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
            })
          : null;
        return end ? `${start} – ${end}` : start;
      })()
    : null;
  const heroCapacity = dbHero?.totalAvailable != null
    ? dbHero.totalAvailable > 0 ? `${dbHero.totalAvailable} seats remaining` : 'Sold out'
    : null;

  return (
    <>
      <AdminRedirect />
      <Navbar />
      <main className="bg-gray-50 min-h-screen">
        {/* Featured hero — two-column on desktop, stacked on mobile */}
        {dbHero && (
        <section className="bg-[#0a0a0a] text-white overflow-hidden">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
            <div className="flex flex-col lg:flex-row lg:items-center lg:gap-14">

              {/* Left — content (order-2 on mobile so image shows first) */}
              <div className="order-2 lg:order-1 lg:flex-1 pt-8 lg:pt-0">
                {dbHero.tagline && (
                  <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-full px-4 py-1.5 mb-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-amber-400 font-bold uppercase tracking-[0.2em] text-xs">{dbHero.tagline}</span>
                  </div>
                )}

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.05] tracking-tight mb-2">
                  {dbHero.title}
                </h1>
                {dbHero.speakerName && dbHero.speakerName !== dbHero.title && (
                  <p className="text-amber-400 text-xl md:text-2xl font-extrabold leading-tight mb-4">
                    {dbHero.speakerName}
                  </p>
                )}

                <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-6 line-clamp-3 max-w-xl">
                  {dbHero.description}
                </p>

                <div className="flex flex-col gap-2.5 mb-7 text-sm">
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <time>{heroDate}</time>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{heroTime}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{dbHero.venue}, {dbHero.city}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    href={`/events/${dbHero.slug}`}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-lg text-base transition-colors shadow-lg shadow-amber-900/30"
                  >
                    Reserve Your Seat
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                  {heroCapacity && (
                    <span className="flex items-center gap-1.5 text-xs text-amber-200/70 border border-amber-400/20 rounded-full px-3 py-1.5">
                      <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {heroCapacity}
                    </span>
                  )}
                </div>
              </div>

              {/* Right — event image card (order-1 on mobile so it shows at top) */}
              {dbHero.imageUrl && (
                <div className="order-1 lg:order-2 lg:w-[48%] lg:flex-shrink-0">
                  <div className="relative w-full aspect-video lg:aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/10 bg-[#111]">
                    <Image
                      src={dbHero.imageUrl}
                      alt={[dbHero.speakerName, dbHero.title].filter(Boolean).join(' — ')}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 48vw"
                      className="object-contain"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        </section>
        )}

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
