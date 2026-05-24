// Sentry browser-side initialization — Next.js + @sentry/nextjs v10 convention.
// This file is automatically loaded by Next.js on the client. No manual import needed.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Capture 10% of traces in production — raise when comfortable with volume
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Replay deliberately disabled for now — re-enable after baseline event flow is verified
    // Capture 100% of sessions where an error occurs, 1% of normal browsing
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    integrations: [Sentry.replayIntegration()],
    enabled: process.env.NODE_ENV === 'production',
  });
}

// Required export for Next.js — fires on navigation, used for Sentry tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
