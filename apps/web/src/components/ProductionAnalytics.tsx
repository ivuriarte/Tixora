'use client';

import { Analytics } from '@vercel/analytics/next';
import { stripFragment } from '@/lib/guestHold';

/**
 * Vercel Web Analytics with URL fragments removed from every event, so a reservation
 * secret in `#t=…` or `#r=…` can never be recorded.
 */
export default function ProductionAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: stripFragment(event.url) })} />;
}
