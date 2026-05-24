'use client';

// @sentry/nextjs v8+ removed automatic webpack injection of sentry.client.config.ts
// for Next.js 14 App Router. Import it here so the browser bundle includes the
// Sentry init call as a side effect when this component is first rendered.
import '../../sentry.client.config';

export default function SentryInit() {
  return null;
}
