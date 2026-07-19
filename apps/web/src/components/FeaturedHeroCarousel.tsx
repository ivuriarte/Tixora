'use client';

import { useEffect, useState, type FocusEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import EventCoverFallback from '@/components/EventCoverFallback';
import {
  conciseHeroCopy,
  formatEventDisplayTitle,
  isDuplicateEventCopy,
  scarcityLabel,
} from '@/lib/event-display';

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
  maxCapacity?: number | null;
  featuredOrder?: number | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

function priceLabel(event: FeaturedHeroEvent) {
  if (event.lowestPrice === 0) return 'Free registration';
  if (event.lowestPrice == null) return null;
  return `Tickets from ₱${event.lowestPrice.toLocaleString('en-PH')}`;
}

function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M7 3v3M17 3v3M4.5 9h15M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z" /></svg>;
}

function PinIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}

function ShieldIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export default function FeaturedHeroCarousel({ events }: { events: FeaturedHeroEvent[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (events.length <= 1 || paused || interactionPaused || reduceMotion) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % events.length), AUTO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [events.length, interactionPaused, paused, reduceMotion]);

  useEffect(() => {
    if (activeIndex >= events.length) setActiveIndex(0);
  }, [activeIndex, events.length]);

  if (events.length === 0) {
    return (
      <section className="relative overflow-hidden bg-[#160126] text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(124,58,237,0.28),transparent_38%)]" />
        <div className="page-container relative py-20 text-center md:py-28">
          <p className="axon-label text-xs text-[#b9a4e8]">Philippine Event Ticketing</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.04em] sm:text-7xl">Find your next unforgettable event.</h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[#d8caef]">New events are added every week. Browse what’s happening—or bring your own event to life.</p>
          <Link href="#upcoming-events" className="axon-pill mt-8 bg-white text-xs text-[#1a0533] hover:bg-[#f3effb]">Browse events</Link>
        </div>
      </section>
    );
  }

  const event = events[activeIndex];
  const eventLabel = isDuplicateEventCopy(event.tagline, event.title) ? null : event.tagline?.trim();
  const shortLabel = eventLabel && eventLabel.length <= 38 ? eventLabel : null;
  const summary = conciseHeroCopy(shortLabel ? event.description : eventLabel || event.description);
  const availability = event.status === 'sold_out'
    ? 'Sold out'
    : scarcityLabel(event.totalAvailable, event.maxCapacity);

  function move(direction: -1 | 1) {
    setActiveIndex((current) => (current + direction + events.length) % events.length);
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteractionPaused(false);
  }

  return (
    <section
      className="relative overflow-hidden bg-[#160126] text-white"
      aria-roledescription="carousel"
      aria-label="Featured events"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocus={() => setInteractionPaused(true)}
      onBlur={handleBlur}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_38%_15%,rgba(124,58,237,0.2),transparent_34%),linear-gradient(115deg,#160126_0%,#20043d_48%,#13001f_100%)]" />

      <div className="page-container relative flex min-h-[560px] items-center lg:min-h-[640px]">
        <div key={event.id} className="hero-reveal relative z-20 w-full py-12 lg:w-[43%] lg:py-20">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d6c6ff]">
            <span className="rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5">Featured</span>
            {shortLabel && <><span aria-hidden="true" className="text-white/35">•</span><span>{shortLabel}</span></>}
          </div>

          <h1 className="mt-6 max-w-2xl text-5xl font-black leading-[0.96] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4rem]">
            {formatEventDisplayTitle(event.title)}
          </h1>
          {event.speakerName && <p className="mt-4 text-sm font-bold uppercase tracking-[0.12em] text-[#c5adff]">Featuring {event.speakerName}</p>}
          {summary && <p className="mt-6 max-w-xl text-base leading-7 text-[#d8caef]">{summary}</p>}

          <div className="mt-7 flex flex-col gap-3 text-sm font-semibold text-[#eee7fb]">
            <div className="flex items-center gap-3"><span className="text-[#b99af7]"><CalendarIcon /></span><span>{formatDate(event.startsAt)} · {formatTime(event.startsAt)}{event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}</span></div>
            <div className="flex items-center gap-3"><span className="text-[#b99af7]"><PinIcon /></span><span>{event.venue}{event.city ? ` · ${event.city}` : ''}</span></div>
          </div>

          {(priceLabel(event) || availability) && (
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1">
              {priceLabel(event) && <p className="text-lg font-bold text-white">{priceLabel(event)}</p>}
              {availability && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${event.status === 'sold_out' ? 'bg-red-400/15 text-red-200' : 'bg-amber-300/15 text-amber-200'}`}>{availability}</span>}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href={`/events/${event.slug}`} className="axon-pill w-full bg-white text-xs text-[#1a0533] hover:bg-[#f3effb] sm:w-auto">{event.status === 'sold_out' ? 'View event' : 'Register now'}</Link>
            <Link href={`/events/${event.slug}`} className="axon-pill w-full border border-white/25 bg-white/[0.03] text-xs text-white hover:bg-white/10 sm:w-auto">View details</Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs font-medium text-[#b9acd0]"><ShieldIcon />Secure checkout · Instant QR confirmation</p>
        </div>
      </div>

      <div className="relative h-[360px] overflow-hidden border-t border-white/10 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[56%] lg:border-l lg:border-t-0">
        {event.imageUrl ? (
          <Image src={event.imageUrl} alt={`${event.title} event cover`} fill priority sizes="(max-width: 1024px) 100vw, 58vw" className="object-cover" />
        ) : (
          <EventCoverFallback title={event.title} startsAt={event.startsAt} />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#160126]/65 via-transparent to-black/10 lg:bg-[linear-gradient(90deg,#160126_0%,rgba(22,1,38,0.7)_13%,rgba(22,1,38,0.08)_48%,rgba(0,0,0,0.08)_100%)]" />

        {events.length > 1 && (
          <div className="absolute bottom-5 left-5 right-5 z-10 flex items-end justify-between gap-5 lg:bottom-8 lg:left-auto lg:right-10">
            <div className="flex gap-2">
              <button type="button" onClick={() => move(-1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white backdrop-blur-md transition hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Previous featured event"><span aria-hidden="true" className="text-xl">‹</span></button>
              <button type="button" onClick={() => setPaused((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white backdrop-blur-md transition hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={paused ? 'Resume featured event carousel' : 'Pause featured event carousel'}><span aria-hidden="true" className="text-sm font-bold">{paused ? '▶' : 'Ⅱ'}</span></button>
              <button type="button" onClick={() => move(1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white backdrop-blur-md transition hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Next featured event"><span aria-hidden="true" className="text-xl">›</span></button>
            </div>
            <div className="w-36 rounded-xl bg-black/30 px-3 py-2 backdrop-blur-md">
              <p className="text-xs font-bold tabular-nums text-white">{String(activeIndex + 1).padStart(2, '0')} <span className="text-white/45">/ {String(events.length).padStart(2, '0')}</span></p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${((activeIndex + 1) / events.length) * 100}%` }} /></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
