import Link from 'next/link';
import Image from 'next/image';
import { formatManila, formatShortDate } from '@tixora/utils';

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
    status: string;
  };
}

export default function EventCard({ event }: Props) {
  return (
    <Link href={`/events/${event.slug}`} className="group block rounded-2xl overflow-hidden bg-white shadow hover:shadow-md transition-shadow">
      <div className="relative h-44 bg-gray-200">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, 400px"
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-50 text-primary text-4xl font-bold select-none">
            {event.title[0]}
          </div>
        )}

        {event.status === 'sold_out' && (
          <span className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">
            SOLD OUT
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
          {formatShortDate(new Date(event.startsAt))} · {event.city}
        </p>
        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-primary transition-colors">
          {event.title}
        </h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">{event.venue}</p>
        {event.lowestPrice != null && (
          <p className="mt-2 text-sm font-semibold text-primary">
            From ₱{event.lowestPrice.toLocaleString()}
          </p>
        )}
      </div>
    </Link>
  );
}
