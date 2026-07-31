import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/marketing/Footer';
import EventCard from '@/components/EventCard';

interface OrganizerProfile {
  id: string;
  name: string;
  about: string;
  slug: string;
  logoUrl?: string | null;
  website?: string | null;
  facebookUrl?: string | null;
  socialLinks?: {
    instagram?: string;
    linkedin?: string;
    x?: string;
  } | null;
  since: string;
  upcomingEvents: Array<{
    id: string;
    slug: string;
    title: string;
    imageUrl?: string | null;
    city: string;
    venue: string;
    startsAt: string;
    endsAt?: string | null;
    category: string;
    eventType: string;
    isOnline: boolean;
    isFree: boolean;
    status: string;
  }>;
}

async function getOrganizer(slug: string): Promise<OrganizerProfile | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';
  const response = await fetch(`${baseUrl}/organizations/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json();
  return body.data ?? body;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const organizer = await getOrganizer(slug);
  if (!organizer) return { title: 'Organizer not found' };
  return {
    title: `${organizer.name} Events`,
    description: organizer.about.slice(0, 155),
    alternates: { canonical: `/organizers/${organizer.slug}` },
  };
}

export default async function OrganizerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const organizer = await getOrganizer(slug);
  if (!organizer) notFound();
  const socialLinks = [
    ['Website', organizer.website],
    ['Facebook', organizer.facebookUrl],
    ['Instagram', organizer.socialLinks?.instagram],
    ['LinkedIn', organizer.socialLinks?.linkedin],
    ['X', organizer.socialLinks?.x],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#faf8ff]">
        <section className="border-b border-[#e4dcf4] bg-[#1a0533] text-white">
          <div className="page-container py-14 sm:py-20">
            <div className="flex flex-col gap-7 sm:flex-row sm:items-center">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/15 bg-white/10">
                {organizer.logoUrl ? (
                  <Image
                    src={organizer.logoUrl}
                    alt={`${organizer.name} logo`}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-4xl font-black text-[#c4b5fd]" aria-hidden="true">
                    {organizer.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="max-w-3xl">
                <p className="axon-label text-xs text-[#a78bfa]">Verified Organizer</p>
                <h1 className="axon-display mt-3 text-4xl text-white sm:text-5xl">{organizer.name}</h1>
                <p className="mt-3 text-sm font-medium text-[#c4b5fd]">On Axon Tickets since {organizer.since}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="page-container grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <section aria-labelledby="about-organizer" className="axon-card p-6 sm:p-8">
              <p className="axon-label text-[10px] text-primary">About</p>
              <h2 id="about-organizer" className="axon-display mt-2 text-2xl text-[#1a0533]">
                Meet the organizer
              </h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#5d5075]">{organizer.about}</p>
            </section>

            <section aria-labelledby="upcoming-organizer-events" className="mt-12">
              <p className="axon-label text-[10px] text-primary">Event calendar</p>
              <h2 id="upcoming-organizer-events" className="axon-display mt-2 text-3xl text-[#1a0533]">
                Upcoming events
              </h2>
              {organizer.upcomingEvents.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-[#d8cdee] bg-white px-6 py-12 text-sm text-[#756a92]">
                  This organizer has no published upcoming events right now.
                </div>
              ) : (
                <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {organizer.upcomingEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={{
                        ...event,
                        organizer: { name: organizer.name, slug: organizer.slug },
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-[#e4dcf4] bg-white p-6">
            <p className="axon-label text-[10px] text-[#756a92]">Official links</p>
            {socialLinks.length > 0 ? (
              <div className="mt-4 space-y-2">
                {socialLinks.map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex min-h-11 items-center justify-between rounded-xl border border-[#e4dcf4] px-4 text-sm font-semibold text-[#1a0533] transition hover:border-primary hover:text-primary"
                  >
                    {label}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#756a92]">No external links published.</p>
            )}
            <Link href="/#events" className="axon-pill mt-6 w-full border border-[#d8cdee] text-xs text-[#1a0533] hover:border-primary">
              Browse all events
            </Link>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
