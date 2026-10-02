import type { ErrorEvent } from '@sentry/node';

/** Request headers that must never be sent to Sentry. */
const SENSITIVE_HEADERS = new Set(['x-registration-token', 'x-cron-secret', 'authorization', 'cookie']);

/**
 * Sentry `beforeSend` hook: removes bearer-style headers (notably the guest access
 * token) from the captured request so they cannot leak through error reports.
 */
export function scrubSentryEvent<T extends ErrorEvent>(event: T): T {
  const headers = event.request?.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete headers[name];
    }
  }
  return event;
}
