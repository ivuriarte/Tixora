'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { scrubAnalyticsEvent } from '@/lib/scrubUrls';

/**
 * Vercel Web Analytics and Speed Insights with URL fragments removed from every event,
 * so a reservation secret in `#t=…` or `#r=…` can never be recorded.
 */
export default function ProductionAnalytics() {
  return (
    <>
      <Analytics beforeSend={scrubAnalyticsEvent} />
      <SpeedInsights beforeSend={scrubAnalyticsEvent} />
    </>
  );
}
