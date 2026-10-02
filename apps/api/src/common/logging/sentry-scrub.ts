/** Request headers that must never be sent to Sentry. */
const SENSITIVE_HEADERS = new Set(['x-registration-token', 'x-cron-secret', 'authorization', 'cookie']);

interface ScrubbableEvent {
  request?: {
    headers?: Record<string, unknown>;
    data?: unknown;
    cookies?: unknown;
    query_string?: unknown;
  };
}

/**
 * Sentry `beforeSend` / `beforeSendTransaction` hook. Removes bearer-style headers (notably
 * the guest access token) and the parts of a request that can hold secrets or personal
 * data: the body (a signed resume token, a typed email address), cookies and the query
 * string. Used for error events and for sampled transactions.
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (!request) return event;
  const headers = request.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete headers[name];
    }
  }
  delete request.data;
  delete request.cookies;
  delete request.query_string;
  return event;
}
