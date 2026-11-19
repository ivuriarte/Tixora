import * as Sentry from '@sentry/node';
import { scrubSentryEvent } from './sentry-scrub';

let initialised = false;

/**
 * Starts the Sentry SDK for the API. Both entry points call this: `main.ts` (local and
 * long-running servers) and `serverless.ts` (the Vercel function that serves UAT and
 * production). It is a no-op when `SENTRY_DSN` is not set, and safe to call more than once.
 *
 * Returns true when Sentry is active for this process.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return false;
  if (initialised) return true;

  Sentry.init({
    dsn,
    environment: env.APP_ENV ?? 'development',
    tracesSampleRate: env.APP_ENV === 'production' ? 0.1 : 1.0,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
  });
  initialised = true;
  return true;
}
