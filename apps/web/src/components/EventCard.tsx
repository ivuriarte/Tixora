import Link from 'next/link';
import Image from 'next/image';
import { formatShortDate } from '@axon-tickets/utils';
import EventCoverFallback from '@/components/EventCoverFallback';

interface Props {
  event: {
    id: string;
    slug: string;
    title: string;
    description: string;
    venue: string;
    city: string;
    startsAt: string;
    imageUrl?: string | null;
    lowestPrice?: number | null;
    isFree?: boolean;
    status: string;
  };
}

export default function EventCard({ event }: Props) {
  return (
    <Link href={`/events/${event.slug}`} className="group axon-card block overflow-hidden transition-colors hover:border-primary">
      <div className="relative aspect-square bg-[#ede9fe]">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
          />
        ) : (
          <EventCoverFallback title={event.title} startsAt={event.startsAt} className="select-none" />
        )}

        {event.status === 'sold_out' && (
          <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
            SOLD OUT
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#756a92]">
          {formatShortDate(new Date(event.startsAt))} · {event.city}
        </p>
        <h3 className="line-clamp-2 font-bold text-[#1a0533] transition-colors group-hover:text-primary">
          {event.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-sm text-[#6b5b8a]">{event.venue}</p>
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
