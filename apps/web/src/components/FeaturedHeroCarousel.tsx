'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import EventCoverFallback from '@/components/EventCoverFallback';

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
  isOrganizerPromotion?: boolean;
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
  const slides = useMemo<FeaturedHeroEvent[]>(
    () => [
      ...events.slice(0, 3),
      {
        id: 'organizer-promotion',
        slug: 'become-organizer',
        title: 'Turn your next event into a sold-out experience.',
        description:
          'Publish an event page, collect verified registrations and payment proofs, issue QR tickets, and manage the gate from one focused workspace.',
        speakerName: null,
        venue: '',
        city: '',
        startsAt: new Date(0).toISOString(),
        endsAt: null,
        status: 'promotion',
        isOrganizerPromotion: true,
      },
    ],
    [events],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  const touchStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (slides.length < 2 || isInteractionPaused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [activeIndex, isInteractionPaused, slides.length]);

  function showSlide(index: number) {
    const normalized = (index + slides.length) % slides.length;
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
  const isOrganizerPromotion = event.isOrganizerPromotion === true;
  const artwork = event.featuredImageUrl || event.imageUrl;

  return (
    <section
      className="relative overflow-hidden bg-[#1a0533] text-white"
      aria-roledescription="carousel"
      aria-label="Featured events"
      tabIndex={0}
      onMouseEnter={() => setIsInteractionPaused(true)}
      onMouseLeave={() => setIsInteractionPaused(false)}
      onFocusCapture={() => setIsInteractionPaused(true)}
      onBlurCapture={(focusEvent) => {
        if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget as Node | null)) {
          setIsInteractionPaused(false);
        }
      }}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'ArrowLeft') {
          keyboardEvent.preventDefault();
          showSlide(activeIndex - 1);
        }
        if (keyboardEvent.key === 'ArrowRight') {
          keyboardEvent.preventDefault();
          showSlide(activeIndex + 1);
        }
      }}
      onTouchStart={(touchEvent) => {
        touchStartRef.current = touchEvent.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(touchEvent) => {
        const start = touchStartRef.current;
        const end = touchEvent.changedTouches[0]?.clientX;
        touchStartRef.current = null;
        if (start == null || end == null || Math.abs(start - end) < 50) return;
        showSlide(start > end ? activeIndex + 1 : activeIndex - 1);
      }}
    >
      {!isOrganizerPromotion && (
        <div key={`${event.id}-desktop`} className="featured-hero-enter relative hidden h-[calc(100svh-93px)] max-h-[920px] min-h-[620px] lg:block">
          <Link
            href={`/events/${event.slug}`}
            className="group absolute inset-0 block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white"
            aria-label={`View ${event.title} event details`}
          >
            {artwork ? (
              <Image
                src={artwork}
                alt={`${event.title} featured event artwork`}
                fill
                priority={activeIndex === 0}
                placeholder="blur"
                blurDataURL={DARK_BLUR_DATA_URL}
                sizes="100vw"
                className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.012]"
              />
            ) : (
              <EventCoverFallback title={event.title} startsAt={event.startsAt} />
            )}
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,0,20,0.26)_0%,transparent_30%,transparent_55%,rgba(8,0,21,0.76)_100%)]" />
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,0,31,0.14),transparent_38%,rgba(13,0,31,0.08))]" />
          </Link>

          <p className="axon-label pointer-events-none absolute left-[5.5vw] top-11 z-10 flex items-center gap-3 text-xs text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.75)] before:h-0.5 before:w-7 before:bg-[#a78bfa] before:content-['']">
            Featured Event
          </p>
          <h1 className="sr-only">{event.title}</h1>

          <Link
            href={`/events/${event.slug}`}
            className="group absolute bottom-[4.5rem] right-[5.5vw] z-20 inline-flex h-[62px] min-w-[214px] items-center justify-between gap-6 rounded-full border border-white/50 bg-white/95 py-2 pl-7 pr-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#17002f] shadow-[0_18px_48px_rgba(11,0,30,0.36)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#a78bfa]"
            aria-label={`View Event: ${event.title}`}
          >
            View Event
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-primary text-xl font-normal leading-none text-white transition-transform duration-200 group-hover:rotate-6 group-hover:scale-105">
              ↗
            </span>
          </Link>
        </div>
      )}

      <div
        key={`${event.id}-mobile`}
        className={`featured-hero-enter mx-auto grid min-h-[610px] max-w-[1600px] gap-9 px-4 pb-24 pt-9 sm:px-6 ${
          isOrganizerPromotion
            ? 'lg:min-h-[560px] lg:grid-cols-[minmax(360px,5fr)_minmax(640px,7fr)] lg:items-center lg:gap-16 lg:px-12 lg:pb-24 lg:pt-12 xl:px-16'
            : 'lg:hidden'
        }`}
      >
        <div className="order-2 min-w-0 lg:order-1" aria-live="polite" aria-atomic="true">
          <p className="axon-label text-xs text-[#a78bfa]">
            {isOrganizerPromotion ? 'For Event Organizers' : 'Featured Event'}
          </p>
          <h1 className="mt-4 max-w-3xl text-balance text-[2rem] font-bold leading-[1.06] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.25rem]">{event.title}</h1>
          {event.speakerName && <p className="axon-label mt-3 text-xs text-[#a78bfa]">Featuring {event.speakerName}</p>}
          {event.description && <p className="mt-5 max-w-2xl text-base leading-7 text-[#c4b5fd] line-clamp-2 sm:line-clamp-3">{event.description}</p>}

          {!isOrganizerPromotion && (
            <div className="mt-6 space-y-3 text-sm font-medium text-[#eee9fb]">
              <p className="flex items-center gap-3 text-balance text-left"><span className="text-[#a78bfa]"><CalendarIcon /></span>{formatDate(event.startsAt)} · {formatTime(event.startsAt)}{event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}</p>
              <p className="flex items-center gap-3 text-balance text-left"><span className="text-[#a78bfa]"><PinIcon /></span>{event.venue}, {event.city}</p>
            </div>
          )}

          {!isOrganizerPromotion && priceLabel(event) && (
            <p className="mt-5 text-base text-[#c4b5fd]">
              {event.isFree ? <><strong className="text-xl text-white">Free</strong> — registration required</> : <>Tickets from <strong className="text-xl text-white">{priceLabel(event)}</strong></>}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {isOrganizerPromotion ? (
              <Link href="/become-organizer" className="axon-pill w-full bg-primary text-xs text-white hover:bg-primary-hover sm:w-auto">
                Become an Organizer
              </Link>
            ) : (
              <Link href={`/events/${event.slug}`} className="axon-pill w-full border border-[#7c3aed] bg-transparent text-xs text-[#d8ccfa] hover:border-[#a78bfa] hover:bg-white/5 hover:text-white sm:w-auto">
                View Event
              </Link>
            )}
          </div>

          <p className="mt-5 flex items-center gap-2 text-xs text-[#a78bfa]">
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
            {isOrganizerPromotion
              ? 'Built for secure Philippine event operations'
              : <>Secure checkout <span aria-hidden="true">·</span> Instant QR confirmation</>}
          </p>
        </div>

        <Link href={isOrganizerPromotion ? '/become-organizer' : `/events/${event.slug}`} className="group order-1 block lg:order-2" aria-label={isOrganizerPromotion ? 'Learn about organizing with Axon Tickets' : `View ${event.title} event details`}>
          <div className="relative aspect-[3/2] overflow-hidden rounded-xl border border-white/10 bg-[#0d021c] shadow-2xl shadow-black/20 lg:aspect-video lg:rounded-2xl">
            {isOrganizerPromotion ? (
              <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_25%_15%,#7c3aed_0%,transparent_38%),linear-gradient(135deg,#2e1065_0%,#0d021c_75%)] p-8 sm:p-12">
                <div className="grid h-full grid-cols-2 gap-4" aria-hidden="true">
                  {['Create', 'Register', 'Approve', 'Check in'].map((step, index) => (
                    <div key={step} className="flex flex-col justify-between rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                      <span className="font-mono text-xs text-[#c4b5fd]">0{index + 1}</span>
                      <span className="text-lg font-bold text-white sm:text-2xl">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : event.featuredImageUrl ? (
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
              <Image
                src={artwork}
                alt={`${event.title} featured event artwork`}
                fill
                priority={activeIndex === 0}
                placeholder="blur"
                blurDataURL={DARK_BLUR_DATA_URL}
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-contain transition-transform duration-500 ease-out group-hover:scale-[1.015]"
              />
            ) : (
              <EventCoverFallback title={event.title} startsAt={event.startsAt} />
            )}
            <span className="absolute bottom-4 right-4 z-20 rounded-full bg-[#0d021c]/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#d8ccfa] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {isOrganizerPromotion ? 'Start organizing' : 'View event'}
            </span>
          </div>
        </Link>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0d021c]/80 to-transparent">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-center px-4 sm:px-6 lg:px-10">
          <div
            className="flex items-center gap-0.5 rounded-full border border-white/10 bg-[#0d021c]/50 px-1.5 py-1 shadow-lg shadow-black/15 backdrop-blur-md"
            role="group"
            aria-label="Choose carousel slide. Slides advance every 5 seconds and pause while you interact with the carousel."
          >
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => showSlide(index)}
                className="group/dot flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={`Show slide ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    index === activeIndex
                      ? 'w-5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.45)]'
                      : 'w-1.5 bg-white/40 group-hover/dot:bg-white/70'
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
