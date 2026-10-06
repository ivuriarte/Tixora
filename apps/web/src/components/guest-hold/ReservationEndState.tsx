'use client';

import { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState, ErrorState } from '@/components/ScreenState';

export type ReservationEndVariant =
  | 'expired'
  | 'cancelled'
  | 'elsewhere'
  | 'throttled'
  | 'limit'
  | 'notyours';

interface ReservationEndStateProps {
  variant: ReservationEndVariant;
  slug: string;
  /** Shown as a second action when it makes sense (for example "Try again"). */
  onRetry?: () => void;
  /**
   * Adds a hidden page-level <h1> for screens that replace the whole page (the payment
   * page returns early, before its own <h1>). Leave off where the page already has one.
   */
  pageHeading?: boolean;
  /**
   * Only for the `notyours` variant: the event's public organizer page. When present, a
   * "Contact {name}" link is the main action; when absent the screen shows "Start again" only.
   */
  organizer?: { name: string; slug: string } | null;
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
  // The `notyours` screen renders its own three paragraphs below; this message is only a
  // plain-text fallback so the table stays total.
  notyours: {
    title: "We couldn't open this registration",
    message: "This registration may have been started with a different email or account from the one you're using now, so we can't show it here.",
  },
};

/**
 * "We couldn't open this registration" (checkout dead end). Plain, warm, age-friendly copy:
 * 16 px text, left-aligned, no email address, no promise that anyone can fix it. A customer
 * who already paid is pointed to the organizer first; "Start again" is the quieter button so
 * they are not drawn to pay twice. Spec: docs/specs/checkout-dead-end-and-incomplete-orders.md (D4).
 */
function NotYoursBody({ slug, organizer, helpId }: { slug: string; organizer?: { name: string; slug: string } | null; helpId: string }) {
  const router = useRouter();
  const hasOrganizer = Boolean(organizer?.slug && organizer?.name);
  const paidAdvice =
    'please keep your payment receipt (a screenshot is fine). Note the amount, the time you paid, and the reference number on it. ';
  return (
    <ErrorState
      title={COPY.notyours.title}
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-left sm:px-6"
      messageClassName="mt-3 max-w-prose space-y-4 text-base leading-relaxed text-red-900"
      message={
        <>
          <p>
            We&apos;re sorry for the trouble. This registration may have been started with a different email or
            account from the one you&apos;re using now, so we can&apos;t show it here.
          </p>
          <p>
            <strong>If you already paid:</strong> {paidAdvice}
            {hasOrganizer
              ? 'Then contact the organizer and share those details.'
              : 'Then get in touch with the people who run this event, using the page or post where you first found it.'}
          </p>
          <p>
            <strong>If you haven&apos;t paid yet:</strong> you can start again.
          </p>
        </>
      }
      action={
        <div className="flex flex-col items-start gap-3">
          {hasOrganizer && organizer && (
            <>
              <Link
                href={`/organizers/${organizer.slug}#official-links`}
                aria-describedby={helpId}
                data-testid="notyours-contact"
                className="axon-pill h-auto min-h-[44px] max-w-full break-words bg-primary py-2 text-center text-base normal-case tracking-normal text-white"
              >
                Contact {organizer.name}
              </Link>
              <p id={helpId} className="text-base leading-relaxed text-red-900">
                Opens their page. Look for &quot;Official links&quot; to reach them.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => router.push(`/events/${slug}`)}
            data-testid="notyours-start-again"
            className="axon-pill min-h-[44px] border-2 border-primary bg-white text-base normal-case tracking-normal text-primary"
          >
            Start again
          </button>
        </div>
      }
    />
  );
}

/**
 * Calm "this reservation is over" screens. Expected end states (expired, cancelled) use
 * EmptyState; things that went wrong (opened elsewhere, throttled, limit) use ErrorState
 * (role="alert"). Focus moves to the screen when it appears so keyboard and screen reader
 * users land on it.
 */
export default function ReservationEndState({ variant, slug, onRetry, pageHeading = false, organizer = null }: ReservationEndStateProps) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { title, message } = COPY[variant];
  const helpId = useId();

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
      {pageHeading && <h1 className="sr-only">{variant === 'notyours' ? 'Your registration' : 'Your reservation'}</h1>}
      {variant === 'notyours' ? (
        <NotYoursBody slug={slug} organizer={organizer} helpId={helpId} />
      ) : isCalm ? (
        <EmptyState title={title} message={message} action={action} />
      ) : (
        <ErrorState title={title} message={message} action={action} />
      )}
    </div>
  );
}
