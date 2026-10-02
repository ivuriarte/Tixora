import Link from 'next/link';
import { Chip } from './StatusChip';

export interface SeatCountValues {
  confirmed?: number | null;
  awaitingReview?: number | null;
  held?: number | null;
}

/** Same words as the Verifications queue: Sold, Awaiting review, Pending payment. */
export const SEAT_LEGEND = [
  { term: 'Sold', text: 'paid and approved.' },
  { term: 'Awaiting review', text: 'proof sent (or free registration), waiting for an admin.' },
  { term: 'Pending payment', text: 'seat held, no proof yet; released automatically after the hold.' },
  { term: 'Sold out', text: 'every seat is reserved, including seats still awaiting review or payment.' },
];

const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * The three seat buckets for an event or a tier. Never shows 0 when the numbers are missing
 * (an older API or a failed load): it says "Counts unavailable" and offers a retry instead.
 *
 * compact: omit zero parts (all zero reads "0 Sold"). Otherwise every part is shown and a
 * zero is a neutral gray chip, never green or red.
 */
export default function SeatCounts({
  counts,
  compact = false,
  onRetry,
}: {
  counts: SeatCountValues;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const { confirmed, awaitingReview, held } = counts;
  if (!isNumber(confirmed) || !isNumber(awaitingReview) || !isNumber(held)) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-gray-500">
        Counts unavailable
        {onRetry && (
          <button type="button" onClick={onRetry} className="min-h-11 px-2 font-semibold text-primary underline">
            Retry
          </button>
        )}
      </span>
    );
  }

  const parts = [
    { key: 'sold', value: confirmed, label: 'Sold', tone: 'emerald' as const },
    { key: 'review', value: awaitingReview, label: 'Awaiting review', tone: 'blue' as const },
    { key: 'held', value: held, label: 'Pending payment', tone: 'amber' as const },
  ];
  const shown = compact ? parts.filter((p) => p.value > 0) : parts;
  const visible = shown.length > 0 ? shown : [parts[0]];

  return (
    <span role="group" aria-label="Seat counts" className="inline-flex flex-wrap items-center gap-1.5">
      {visible.map((p) => (
        <Chip key={p.key} tone={p.value === 0 ? 'gray' : p.tone}>
          {p.value} {p.label}
        </Chip>
      ))}
    </span>
  );
}

/** Always-visible explanation (no hover needed). */
export function SeatLegend() {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600">
      <p className="font-semibold text-gray-800">What the counts mean</p>
      <ul className="mt-1 space-y-0.5">
        {SEAT_LEGEND.map((l) => (
          <li key={l.term}>
            <span className="font-semibold">{l.term}</span> — {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 44 px target to Transactions filtered to this event's pending checkouts. Hidden when none. */
export function PendingCheckoutsLink({ eventId, held }: { eventId: string; held?: number | null }) {
  if (!isNumber(held) || held <= 0) return null;
  return (
    <Link
      href={`/admin/orders?eventId=${encodeURIComponent(eventId)}&status=pending`}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
    >
      View pending checkouts
    </Link>
  );
}
