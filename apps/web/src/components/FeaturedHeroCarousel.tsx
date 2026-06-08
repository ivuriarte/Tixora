'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const AUTO_ROTATE_MS = 7000;

type FeaturedHeroEvent = {
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
};

function formatHeroDate(startsAt: string) {
  return new Date(startsAt).toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

function formatHeroTime(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });

  if (!endsAt) {
    return start;
  }

  const end = new Date(endsAt).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });

  return `${start} – ${end}`;
}

function formatCapacity(totalAvailable?: number) {
  if (totalAvailable == null) {
    return null;
  }

  return totalAvailable > 0 ? `${totalAvailable} seats remaining` : 'Sold out';
}

export default function FeaturedHeroCarousel({ events }: { events: FeaturedHeroEvent[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (events.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % events.length);
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [events.length]);

  useEffect(() => {
    if (activeIndex >= events.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, events.length]);

  if (events.length === 0) {
    return null;
  }

  const activeEvent = events[activeIndex];
  const heroDate = formatHeroDate(activeEvent.startsAt);
  const heroTime = formatHeroTime(activeEvent.startsAt, activeEvent.endsAt);
  const heroCapacity = formatCapacity(activeEvent.totalAvailable);

  return (
    <section className="bg-[#0a0a0a] text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-14">
          <div className="order-2 lg:order-1 lg:flex-1 pt-8 lg:pt-0">
            {activeEvent.tagline && (
              <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-full px-4 py-1.5 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-400 font-bold uppercase tracking-[0.2em] text-xs">
                  {activeEvent.tagline}
                </span>
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.05] tracking-tight mb-2">
              {activeEvent.title}
            </h1>
            {activeEvent.speakerName && activeEvent.speakerName !== activeEvent.title && (
              <p className="text-amber-400 text-xl md:text-2xl font-extrabold leading-tight mb-4">
                {activeEvent.speakerName}
              </p>
            )}

            <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-6 line-clamp-3 max-w-xl">
              {activeEvent.description}
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
                <span>{activeEvent.venue}, {activeEvent.city}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={`/events/${activeEvent.slug}`}
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

            {events.length > 1 && (
              <div className="mt-8 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {events.map((event, index) => (
                    <button
                      key={event.id}
                      type="button"
                      aria-label={`Show featured event ${index + 1}`}
                      aria-pressed={index === activeIndex}
                      onClick={() => setActiveIndex(index)}
                      className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-8 bg-amber-400' : 'w-2.5 bg-white/30 hover:bg-white/50'}`}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-400">
                  {activeIndex + 1} / {events.length}
                </span>
              </div>
            )}
          </div>

          {activeEvent.imageUrl && (
            <div className="order-1 lg:order-2 lg:w-[48%] lg:flex-shrink-0">
              <div className="relative w-full aspect-video lg:aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/10 bg-[#111]">
                <Image
                  src={activeEvent.imageUrl}
                  alt={[activeEvent.speakerName, activeEvent.title].filter(Boolean).join(' — ')}
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
  );
}