'use client';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __axonPixelDedupe?: Record<string, true>;
  }
}

type PixelParams = Record<string, unknown>;

function canUsePixel(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

function shouldSkip(dedupeKey?: string): boolean {
  if (!dedupeKey || typeof window === 'undefined') return false;
  window.__axonPixelDedupe = window.__axonPixelDedupe ?? {};
  if (window.__axonPixelDedupe[dedupeKey]) return true;
  window.__axonPixelDedupe[dedupeKey] = true;
  return false;
}

function devDebug(kind: 'track' | 'trackCustom', name: string, params?: PixelParams) {
  if (process.env.NODE_ENV !== 'development') return;
  console.debug('[MetaPixel]', kind, name, params ?? {});
}

export function trackPixelEvent(eventName: string, params?: PixelParams, dedupeKey?: string) {
  if (shouldSkip(dedupeKey)) return;
  if (!canUsePixel()) return;

  try {
    if (params && Object.keys(params).length > 0) {
      window.fbq?.('track', eventName, params);
    } else {
      window.fbq?.('track', eventName);
    }
    devDebug('track', eventName, params);
  } catch {
    // Swallow analytics errors so conversion flow never breaks.
  }
}

export function trackPixelCustomEvent(
  eventName: string,
  params?: PixelParams,
  dedupeKey?: string,
) {
  if (shouldSkip(dedupeKey)) return;
  if (!canUsePixel()) return;

  try {
    window.fbq?.('trackCustom', eventName, params ?? {});
    devDebug('trackCustom', eventName, params);
  } catch {
    // Swallow analytics errors so conversion flow never breaks.
  }
}
