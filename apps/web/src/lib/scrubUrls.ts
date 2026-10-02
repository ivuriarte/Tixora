import { stripFragment } from './guestHold';

/**
 * URL scrubbers shared by every tracker. A reservation link keeps a secret in its URL
 * fragment (#t=… or #r=…); none of these may ever pass a fragment on.
 */

/** Sentry events and transactions: `event.request.url`. */
export function scrubRequestUrl<T extends { url?: string } | undefined>(request: T): T {
  if (request && typeof request.url === 'string') request.url = stripFragment(request.url);
  return request;
}

/** Sentry navigation / fetch breadcrumbs: `data.from`, `data.to`, `data.url`. */
export function scrubBreadcrumbData<T extends { data?: Record<string, unknown> }>(breadcrumb: T): T {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ['from', 'to', 'url']) {
      const value = data[key];
      if (typeof value === 'string') data[key] = stripFragment(value);
    }
  }
  return breadcrumb;
}

/** Vercel Analytics / Speed Insights events: `event.url`. */
export function scrubAnalyticsEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: stripFragment(event.url) };
}
