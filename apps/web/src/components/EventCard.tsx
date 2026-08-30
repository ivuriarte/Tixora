import Link from 'next/link';
import Image from 'next/image';
import { formatShortDate } from '@axon-tickets/utils';
import EventCoverFallback from '@/components/EventCoverFallback';

interface Props {
  event: {
    id: string;
    slug: string;
    title: string;
    description?: string | null;
    venue: string;
    city: string;
    startsAt: string;
    endsAt?: string | null;
    imageUrl?: string | null;
    lowestPrice?: number | null;
    isFree?: boolean;
    status: string;
    category?: string;
    eventType?: string;
    isOnline?: boolean;
    labels?: string[];
    organizer?: { name: string; slug?: string | null } | null;
  };
}

export default function EventCard({ event }: Props) {
  const labelStyles: Record<string, string> = {
    'Hottest Right Now': 'bg-fuchsia-600 text-white',
    'Selling Fast': 'bg-amber-500 text-[#1a0533]',
    'Few Remaining': 'bg-rose-600 text-white',
    'Sales End Soon': 'bg-orange-600 text-white',
    New: 'bg-emerald-600 text-white',
    Online: 'bg-sky-600 text-white',
    'Event Concluded': 'bg-slate-800 text-white',
  };
  return (
    <Link href={`/events/${event.slug}`} className="group axon-card block overflow-hidden !rounded-none transition-colors hover:border-primary">
      <div className="relative aspect-video bg-white">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
          />
        ) : (
          <EventCoverFallback title={event.title} startsAt={event.startsAt} className="select-none" />
        )}

        {event.status === 'sold_out' && (
          <span className="absolute right-3 top-3 z-20 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
            SOLD OUT
          </span>
        )}
        {event.labels && event.labels.length > 0 && (
          <div className="absolute left-3 top-3 z-20 flex max-w-[80%] flex-wrap gap-1.5">
            {event.labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.07em] shadow-sm ${
                  labelStyles[label] ?? 'bg-white/95 text-[#1a0533]'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#756a92]">
          {event.category ? `${event.category} · ` : ''}{formatShortDate(new Date(event.startsAt))} · {event.city}
        </p>
        <h3 className="line-clamp-2 font-bold text-[#1a0533] transition-colors group-hover:text-primary">
          {event.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-sm text-[#6b5b8a]">{event.venue}</p>
        {event.organizer?.name && (
          <p className="mt-1 line-clamp-1 text-xs font-medium text-[#756a92]">
            By {event.organizer.name}
          </p>
        )}
        {event.isFree || event.lowestPrice === 0 ? (
          <p className="mt-2 text-sm font-semibold text-primary">Free</p>
        ) : event.lowestPrice != null ? (
          <p className="mt-2 text-sm font-semibold text-primary">
            From ₱{event.lowestPrice.toLocaleString()}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
