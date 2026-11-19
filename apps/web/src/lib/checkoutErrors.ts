import { funnelFailureCode, type FunnelFailureCode } from './funnel';

/** What a failed checkout request looked like, reduced to a few safe facts. */
export interface CheckoutFailure {
  /** 'http' = the server answered; 'network' = it never answered; 'unexpected' = a bug in our own code. */
  kind: 'http' | 'network' | 'unexpected';
  httpStatus?: number;
  /** The server's own message, only meaningful for client errors (4xx). */
  serverMessage?: string | string[];
  /** A code from the fixed list used for funnel metadata. Never derived from a message. */
  code: FunnelFailureCode;
}

export function readCheckoutFailure(err: unknown): CheckoutFailure {
  const isAxios = typeof err === 'object' && err !== null && (err as { isAxiosError?: unknown }).isAxiosError === true;
  if (!isAxios) return { kind: 'unexpected', code: 'other' };
  const response = (err as { response?: { status?: unknown; data?: { message?: unknown } } }).response;
  if (!response || typeof response.status !== 'number') return { kind: 'network', code: 'network' };
  const message = response.data?.message;
  return {
    kind: 'http',
    httpStatus: response.status,
    serverMessage:
      typeof message === 'string' || (Array.isArray(message) && message.every((item) => typeof item === 'string'))
        ? (message as string | string[])
        : undefined,
    code: funnelFailureCode(response.status),
  };
}

/**
 * The words a buyer sees when a checkout request fails. Rate limits, server faults and lost
 * connections get plain advice (never a raw server message such as "ThrottlerException:
 * Too Many Requests"); ordinary rejections such as "Invalid code" keep the server's own wording.
 */
export function checkoutErrorMessage(failure: CheckoutFailure, fallback: string): string {
  if (failure.kind === 'network') {
    return "We couldn't reach the server. Check your internet connection, then press the button again.";
  }
  if (failure.kind === 'unexpected') {
    return 'Something unexpected happened on this page. Please press the button again. If it keeps happening, contact the organizer with your reference number.';
  }
  if (failure.httpStatus === 429) {
    return 'Too many tries in a short time. Please wait a minute, then press the button again.';
  }
  if (failure.httpStatus !== undefined && failure.httpStatus >= 500) {
    return 'Something went wrong on our side. Your payment screenshot is safe. Please press the button again in a moment.';
  }
  const message = Array.isArray(failure.serverMessage) ? failure.serverMessage.join(' ') : failure.serverMessage;
  return message && message.trim() ? message : fallback;
}

/** Shown when the confirm button is pressed but the page no longer knows which order it belongs to. */
export const LOST_ORDER_MESSAGE =
  "We can't find your saved order on this device any more (for example after the tab was closed). Please go back to your payment page and open the link again, or contact the organizer with your reference number.";
