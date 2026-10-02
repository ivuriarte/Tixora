'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState, ErrorState } from '@/components/ScreenState';

export type ReservationEndVariant =
  | 'expired'
  | 'cancelled'
  | 'elsewhere'
  | 'throttled'
  | 'limit';

interface ReservationEndStateProps {
  variant: ReservationEndVariant;
  slug: string;
  /** Shown as a second action when it makes sense (for example "Try again"). */
  onRetry?: () => void;
}

const COPY: Record<ReservationEndVariant, { title: string; message: string }> = {
  expired: {
    title: 'Your reservation expired',
    message:
      'Seats are only held for a short time while payment is pending. Nothing was charged. Start again to pick your seats.',
  },
  cancelled: {
    title: 'Your reservation was cancelled',
    message: 'Your seats are available to others again. Nothing was charged.',
  },
  elsewhere: {
    title: "We couldn't open this reservation here",
    message:
      'It may have been opened on another device. Open the link from your email again, or start again.',
  },
  throttled: {
    title: 'Too many attempts',
    message: 'Please wait a minute and try again.',
  },
  limit: {
    title: 'Too many reservations from this connection',
    message: 'Finish or cancel one you already started, or try again in about an hour.',
  },
};

/**
 * Calm "this reservation is over" screens. Expected end states (expired, cancelled) use
 * EmptyState; things that went wrong (opened elsewhere, throttled, limit) use ErrorState
 * (role="alert"). Focus moves to the screen when it appears so keyboard and screen reader
 * users land on it.
 */
export default function ReservationEndState({ variant, slug, onRetry }: ReservationEndStateProps) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { title, message } = COPY[variant];

  useEffect(() => {
    ref.current?.focus();
  }, [variant]);

  const startAgain = (
    <button
      type="button"
      onClick={() => router.push(`/events/${slug}`)}
      className="axon-pill min-h-[44px] bg-primary text-xs text-white"
    >
      {variant === 'limit' || variant === 'throttled' ? 'Back to event' : 'Start again'}
    </button>
  );

  const action = onRetry ? (
    <div className="flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={onRetry}
        className="axon-pill min-h-[44px] bg-primary text-xs text-white"
      >
        Try again
      </button>
      {startAgain}
    </div>
  ) : (
    startAgain
  );

  const isCalm = variant === 'expired' || variant === 'cancelled';
  return (
    <div ref={ref} tabIndex={-1} className="outline-none" data-testid={`reservation-${variant}`}>
      {isCalm ? (
        <EmptyState title={title} message={message} action={action} />
      ) : (
        <ErrorState title={title} message={message} action={action} />
      )}
    </div>
  );
}
