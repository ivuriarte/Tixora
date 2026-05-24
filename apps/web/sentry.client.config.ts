// Sentry browser-side initialization — auto-injected by @sentry/nextjs webpack plugin
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// No-op if DSN is not configured (local dev, or env var not yet set)
if (dsn) {
  Sentry.init({
    dsn,
    // Capture 10% of traces in production — raise when comfortable with volume
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Capture 100% of session replays on error, 1% on normal browsing
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    // replayIntegration is browser-only — guard against SSR execution
    integrations: typeof window !== 'undefined' ? [Sentry.replayIntegration()] : [],
    // Don't send events in development
    enabled: process.env.NODE_ENV === 'production',
  });
}
