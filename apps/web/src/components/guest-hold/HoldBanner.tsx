'use client';

import { useEffect, useRef, useState } from 'react';
import {
  announcementText,
  crossedAnnouncement,
  describeHold,
  formatHoldDeadline,
} from '@/lib/guestHold';

interface HoldBannerProps {
  /** ISO deadline from the API. Null or missing means no deadline, so no banner. */
  deadlineIso: string | null | undefined;
  /** Called once when the deadline passes. */
  onExpired: () => void;
  /** True when the hold was silently replaced because an earlier one expired. */
  renewed?: boolean;
}

/**
 * Tells a guest how long their seats are held.
 *
 * Accessibility: the ticking digits are hidden from screen readers (with a static text
 * equivalent), and the polite live region only speaks at 10, 5 and 1 minute left, so a
 * screen reader never reads a value that changes every second. Urgency is always in
 * words ("Only 4:32 left"), never in colour alone.
 */
export default function HoldBanner({ deadlineIso, onExpired, renewed = false }: HoldBannerProps) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const previousSeconds = useRef<number | null>(null);
  const expiredFired = useRef(false);

  const display = describeHold(deadlineIso, now);

  // Tick every second near the end, every 30 seconds while there is plenty of time.
  const seconds = display && display.mode !== 'expired' ? display.seconds : null;
  useEffect(() => {
    if (!deadlineIso) return;
    const delay = seconds !== null && seconds <= 2 * 60 * 60 ? 1000 : 30_000;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [deadlineIso, now, seconds]);

  useEffect(() => {
    if (display?.mode === 'expired' && !expiredFired.current) {
      expiredFired.current = true;
      onExpired();
    }
  }, [display?.mode, onExpired]);

  useEffect(() => {
    if (seconds === null) return;
    if (previousSeconds.current !== null) {
      const crossed = crossedAnnouncement(previousSeconds.current, seconds);
      if (crossed) setAnnouncement(announcementText(crossed));
    }
    previousSeconds.current = seconds;
  }, [seconds]);

  if (!display || display.mode === 'expired') return null;

  const renewedNote = renewed ? (
    <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-800">
      <p className="font-semibold">Your earlier reservation expired, so we started a new one.</p>
    </div>
  ) : null;

  if (display.mode === 'date') {
    return (
      <>
        {renewedNote}
        <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-800" data-testid="hold-banner">
          <p className="font-semibold text-gray-900">Your seats are held until {display.text}</p>
          <p className="mt-1 text-xs text-gray-600">
            Upload your payment proof before then to keep your seats.
          </p>
        </div>
      </>
    );
  }

  const urgent = display.mode === 'countdown' && display.urgent;
  const readableTime = display.mode === 'countdown' ? `${Math.ceil(display.seconds / 60)} minutes` : display.text;

  return (
    <>
      {renewedNote}
      <div
        className={`mb-5 rounded-xl border bg-amber-50 px-4 py-3 text-sm text-amber-900 ${
          urgent ? 'border-2 border-amber-400' : 'border-amber-200'
        }`}
        data-testid="hold-banner"
      >
        <p className="font-semibold">
          {urgent ? 'Only ' : 'Upload your proof within '}
          <span aria-hidden="true" className="tabular-nums">{display.text}</span>
          <span className="sr-only">{`about ${readableTime}`}</span>
          {urgent ? ' left' : ''}
        </p>
        <p className="mt-1 text-xs text-amber-800">
          {urgent
            ? 'Upload your proof now, or use "I will pay later".'
            : 'After that your seats are released.'}
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Seats are held until {formatHoldDeadline(deadlineIso as string)}.
        </p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </>
  );
}
