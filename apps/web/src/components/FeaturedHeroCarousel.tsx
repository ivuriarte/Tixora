'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import EventCoverFallback from '@/components/EventCoverFallback';

const AUTO_ROTATE_MS = 8000;
const DARK_BLUR_DATA_URL =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2230%22 height=%2220%22%3E%3Crect width=%2230%22 height=%2220%22 fill=%22%230d021c%22/%3E%3C/svg%3E';

type FeaturedHeroEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  speakerName?: string | null;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string | null;
  imageUrl?: string | null;
  featuredImageUrl?: string | null;
  status: string;
  lowestPrice?: number | null;
  isFree?: boolean;
  totalAvailable?: number;
  primaryTierId?: string | null;
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
  if (event.isFree || event.lowestPrice === 0) return 'Free';
  if (event.lowestPrice == null) return null;
  return `₱${event.lowestPrice.toLocaleString('en-PH')}`;
}

function registrationUrl(event: FeaturedHeroEvent) {
  if (!event.primaryTierId) return `/events/${event.slug}#ticket-panel`;
  const params = new URLSearchParams({
    tierId: event.primaryTierId,
    qty: '1',
    eventId: event.id,
    eventSlug: event.slug,
    eventName: event.title,
  });
  return `/events/${event.slug}/register?${params.toString()}`;
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export default function FeaturedHeroCarousel({ events }: { events: FeaturedHeroEvent[] }) {
  const slides = useMemo(() => events.slice(0, 3), [events]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
      elapsedRef.current = 0;
      setProgress(0);
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || paused || interacting || reduceMotion) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsedRef.current += now - previous;
      previous = now;
      if (elapsedRef.current >= AUTO_ROTATE_MS) {
        elapsedRef.current = 0;
        setProgress(0);
        setActiveIndex((current) => (current + 1) % slides.length);
        return;
      }
      setProgress(elapsedRef.current / AUTO_ROTATE_MS);
    }, 80);
    return () => window.clearInterval(timer);
  }, [interacting, paused, reduceMotion, slides.length]);

  function showSlide(index: number) {
    const normalized = (index + slides.length) % slides.length;
    elapsedRef.current = 0;
    setProgress(0);
    setActiveIndex(normalized);
  }

  if (slides.length === 0) {
    return (
      <section className="bg-[#1a0533] text-white">
        <div className="page-container py-16 text-center md:py-24">
          <p className="axon-label text-xs text-[#a78bfa]">Philippine Event Ticketing</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-balance text-4xl font-bold leading-[1.06] tracking-[-0.03em] sm:text-6xl">Find your next unforgettable event.</h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[#c4b5fd]">New events are added every week. Browse what’s happening—or bring your own event to life.</p>
          <Link href="#upcoming-events" className="axon-pill mt-8 bg-primary text-xs text-white hover:bg-primary-hover">Browse Events</Link>
        </div>
      </section>
    );
  }

  const event = slides[activeIndex];
  const soldOut = event.status === 'sold_out' || event.totalAvailable === 0;
  const capacity = event.totalAvailable == null
    ? null
    : soldOut
      ? 'Sold out'
      : `${event.totalAvailable.toLocaleString('en-PH')} ${event.isFree ? 'slots' : 'seats'} remaining`;
  const artwork = event.featuredImageUrl || event.imageUrl;
  const primaryHref = event.isFree ? registrationUrl(event) : `/events/${event.slug}#ticket-panel`;

  return (
    <section
      className="relative overflow-hidden bg-[#1a0533] text-white"
      aria-roledescription="carousel"
      aria-label="Featured events"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(eventBlur) => {
        if (!eventBlur.currentTarget.contains(eventBlur.relatedTarget as Node | null)) setInteracting(false);
      }}
    >
      <div key={event.id} className="featured-hero-enter mx-auto grid min-h-[610px] max-w-[1440px] gap-9 px-4 pb-28 pt-9 sm:px-6 lg:grid-cols-[minmax(0,.88fr)_minmax(560px,1.12fr)] lg:items-center lg:gap-14 lg:px-10 lg:pb-28 lg:pt-14">
        <div className="order-2 min-w-0 lg:order-1" aria-live="polite" aria-atomic="true">
          <p className="axon-label text-xs text-[#a78bfa]">Featured Event</p>
          <h1 className="mt-4 max-w-3xl text-balance text-[2rem] font-bold leading-[1.06] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.25rem]">{event.title}</h1>
          {event.speakerName && <p className="axon-label mt-3 text-xs text-[#a78bfa]">Featuring {event.speakerName}</p>}
          {event.description && <p className="mt-5 max-w-2xl text-base leading-7 text-[#c4b5fd] line-clamp-2 sm:line-clamp-3">{event.description}</p>}

          <div className="mt-6 space-y-3 text-sm font-medium text-[#eee9fb]">
            <p className="flex items-center gap-3 text-balance text-left"><span className="text-[#a78bfa]"><CalendarIcon /></span>{formatDate(event.startsAt)} · {formatTime(event.startsAt)}{event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}</p>
            <p className="flex items-center gap-3 text-balance text-left"><span className="text-[#a78bfa]"><PinIcon /></span>{event.venue}, {event.city}</p>
          </div>

          {priceLabel(event) && (
            <p className="mt-5 text-base text-[#c4b5fd]">
              {event.isFree ? <><strong className="text-xl text-white">Free</strong> — registration required</> : <>Tickets from <strong className="text-xl text-white">{priceLabel(event)}</strong></>}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {!soldOut && (
              <Link href={primaryHref} className="axon-pill w-full bg-primary text-xs text-white hover:bg-primary-hover sm:w-auto">
                {event.isFree ? 'Register Free' : 'Get Tickets'}
              </Link>
            )}
            <Link href={`/events/${event.slug}`} className="axon-pill w-full border border-[#7c3aed] bg-transparent text-xs text-[#d8ccfa] hover:border-[#a78bfa] hover:bg-white/5 hover:text-white sm:w-auto">
              View Event
            </Link>
            {capacity && (
              <span className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#6d28d9] px-4 text-xs font-semibold text-[#c4b5fd] sm:w-auto">
                <span className={`h-2 w-2 rounded-full ${soldOut ? 'bg-red-400' : 'bg-emerald-400'}`} aria-hidden="true" />
                {capacity}
              </span>
            )}
          </div>

          <p className="mt-5 flex items-center gap-2 text-xs text-[#a78bfa]">
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
            Secure checkout <span aria-hidden="true">·</span> Instant QR confirmation
          </p>
        </div>

        <Link href={`/events/${event.slug}`} className="group order-1 block lg:order-2" aria-label={`View ${event.title} event details`}>
          <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-white/10 bg-[#0d021c] shadow-2xl shadow-black/20">
            {event.featuredImageUrl ? (
              <Image
                src={event.featuredImageUrl}
                alt={`${event.title} featured event artwork`}
                fill
                priority={activeIndex === 0}
                placeholder="blur"
                blurDataURL={DARK_BLUR_DATA_URL}
                sizes="(max-width: 1024px) 100vw, 56vw"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
              />
            ) : artwork ? (
              <>
                <Image
                  src={artwork}
                  alt=""
                  fill
                  aria-hidden="true"
                  sizes="(max-width: 1024px) 100vw, 56vw"
                  className="scale-110 object-cover opacity-35 blur-xl"
                />
                <Image
                  src={artwork}
                  alt={`${event.title} featured event artwork`}
                  fill
                  priority={activeIndex === 0}
                  placeholder="blur"
                  blurDataURL={DARK_BLUR_DATA_URL}
                  sizes="(max-width: 1024px) 100vw, 56vw"
                  className="z-10 object-contain transition-transform duration-500 ease-out group-hover:scale-[1.015]"
                />
              </>
            ) : (
              <EventCoverFallback title={event.title} startsAt={event.startsAt} />
            )}
            <span className="absolute bottom-4 right-4 z-20 rounded-full bg-[#0d021c]/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#d8ccfa] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">View event</span>
          </div>
        </Link>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-[#0d021c]/45 backdrop-blur-sm">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <p className="min-w-[64px] text-sm font-extrabold tabular-nums text-white">
            {String(activeIndex + 1).padStart(2, '0')} <span className="font-semibold text-[#a78bfa]">/ {String(slides.length).padStart(2, '0')}</span>
          </p>
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear" style={{ width: `${slides.length <= 1 ? 100 : progress * 100}%` }} />
          </div>
          {slides.length > 1 && (
            <div className="ml-auto flex gap-2 sm:gap-3">
              <button type="button" onClick={() => showSlide(activeIndex - 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#6d28d9] text-[#c4b5fd] transition-colors hover:border-[#a78bfa] hover:bg-white/5 hover:text-white" aria-label="Previous featured event">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button type="button" onClick={() => setPaused((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#6d28d9] text-[#c4b5fd] transition-colors hover:border-[#a78bfa] hover:bg-white/5 hover:text-white" aria-label={paused ? 'Resume featured event carousel' : 'Pause featured event carousel'}>
                {paused ? <span aria-hidden="true" className="ml-0.5 text-sm">▶</span> : <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" /></svg>}
              </button>
              <button type="button" onClick={() => showSlide(activeIndex + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#6d28d9] text-[#c4b5fd] transition-colors hover:border-[#a78bfa] hover:bg-white/5 hover:text-white" aria-label="Next featured event">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
