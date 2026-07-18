'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import EventCoverFallback from '@/components/EventCoverFallback';

const AUTO_ROTATE_MS = 6000;

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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

function priceLabel(event: FeaturedHeroEvent) {
  if (event.lowestPrice === 0) return 'Free';
  if (event.lowestPrice == null) return null;
  return `From ₱${event.lowestPrice.toLocaleString('en-PH')}`;
}

export default function FeaturedHeroCarousel({ events }: { events: FeaturedHeroEvent[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (events.length <= 1 || paused || reduceMotion) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % events.length), AUTO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [events.length, paused, reduceMotion]);

  useEffect(() => {
    if (activeIndex >= events.length) setActiveIndex(0);
  }, [activeIndex, events.length]);

  if (events.length === 0) {
    return (
      <section className="bg-[#1a0533] text-white">
        <div className="page-container py-16 text-center md:py-24">
          <p className="axon-label text-xs text-[#a78bfa]">Philippine Event Ticketing</p>
          <h1 className="axon-display mx-auto mt-5 max-w-4xl text-5xl sm:text-7xl">Find your next unforgettable event.</h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[#c4b5fd]">New events are added every week. Browse what’s happening—or bring your own event to life.</p>
          <Link href="#upcoming-events" className="axon-pill mt-8 bg-primary text-xs text-white hover:bg-primary-hover">Browse Events</Link>
        </div>
      </section>
    );
  }

  const event = events[activeIndex];
  const capacity = event.totalAvailable == null ? null : event.totalAvailable > 0 ? `${event.totalAvailable} seats remaining` : 'Sold out';

  return (
    <section className="bg-[#1a0533] text-white" aria-roledescription="carousel" aria-label="Featured events">
      <div className="page-container grid min-h-[560px] gap-10 py-10 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-16">
        <div className="order-1">
          <p className="axon-label text-xs text-[#a78bfa]">{event.tagline || 'Featured Event'}</p>
          <h1 className="axon-display mt-5 max-w-3xl text-5xl text-white sm:text-6xl lg:text-7xl">{event.title}</h1>
          {event.speakerName && <p className="axon-label mt-4 text-sm text-[#a78bfa]">Featuring {event.speakerName}</p>}
          {event.description && <p className="mt-6 max-w-2xl text-base leading-7 text-[#c4b5fd] line-clamp-3">{event.description}</p>}

          <div className="mt-7 space-y-2 text-sm font-medium text-[#c4b5fd]">
            <p>{formatDate(event.startsAt)} · {formatTime(event.startsAt)}{event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}</p>
            <p>{event.venue}, {event.city}</p>
          </div>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link href={`/events/${event.slug}`} className="axon-pill w-full bg-primary text-xs text-white hover:bg-primary-hover sm:w-auto">Reserve Your Seat</Link>
            {(capacity || priceLabel(event)) && <span className="text-xs font-semibold text-[#a78bfa]">{[priceLabel(event), capacity].filter(Boolean).join(' · ')}</span>}
          </div>

          {events.length > 1 && (
            <div className="mt-9 flex items-center gap-3">
              <div className="flex items-center gap-2" aria-label="Choose featured event">
                {events.map((item, index) => (
                  <button key={item.id} type="button" aria-label={`Show featured event ${index + 1}: ${item.title}`} aria-current={index === activeIndex} onClick={() => setActiveIndex(index)} className={`h-3 rounded-full ${index === activeIndex ? 'w-8 bg-primary' : 'w-3 bg-white/30 hover:bg-white/50'}`} />
                ))}
              </div>
              <span className="min-w-[42px] text-xs font-semibold tabular-nums text-[#a78bfa]">{activeIndex + 1} / {events.length}</span>
              <button type="button" onClick={() => setPaused((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full border border-primary-700 text-[#a78bfa] hover:bg-white/10" aria-label={paused ? 'Resume featured event carousel' : 'Pause featured event carousel'}>
                {paused ? <span aria-hidden="true">▶</span> : <span aria-hidden="true" className="tracking-[-0.2em]">Ⅱ</span>}
              </button>
            </div>
          )}
        </div>

        <div className="order-2 overflow-hidden rounded-lg border border-white/10 bg-[#2d0f5e]">
          <div className="relative aspect-[4/3]">
            {event.imageUrl ? (
              <Image src={event.imageUrl} alt={`${event.title} event cover`} fill priority sizes="(max-width: 1024px) 100vw, 45vw" className="object-contain" />
            ) : (
              <EventCoverFallback title={event.title} startsAt={event.startsAt} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
