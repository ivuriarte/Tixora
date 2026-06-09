'use client';

const SESSION_KEY = 'axon_funnel_session_id';

type FunnelStep =
  | 'event_page_viewed'
  | 'register_cta_clicked'
  | 'email_submitted'
  | 'otp_send_requested'
  | 'otp_sent'
  | 'otp_send_failed'
  | 'otp_verified'
  | 'otp_verification_failed'
  | 'profile_started'
  | 'profile_completed'
  | 'ticket_selection_started'
  | 'payment_started'
  | 'payment_submitted'
  | 'registration_submitted_for_review'
  | 'ticket_issued';

type FunnelStatus = 'started' | 'success' | 'failed' | 'abandoned' | 'blocked';

interface FunnelPayload {
  step: FunnelStep;
  status: FunnelStatus;
  eventId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

function devDebug(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'development') return;
  // eslint-disable-next-line no-console
  console.debug('[Funnel]', ...args);
}

export function getOrCreateFunnelSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(SESSION_KEY, generated);
  try {
    document.cookie = `${SESSION_KEY}=${generated}; Path=/; Max-Age=15552000; SameSite=Lax`;
  } catch {
    // Cookie writes can fail in strict privacy contexts. localStorage is enough.
  }
  return generated;
}

export async function trackInternalFunnelEvent(payload: FunnelPayload): Promise<void> {
  if (typeof window === 'undefined') return;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';
  const body = {
    eventId: payload.eventId,
    sessionId: getOrCreateFunnelSessionId(),
    email: payload.email,
    step: payload.step,
    status: payload.status,
    metadata: {
      ...(payload.metadata ?? {}),
      currentUrl: window.location.href,
      referrer: document.referrer || null,
    },
  };

  try {
    await fetch(`${apiBase}/funnel/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(body),
    });
    devDebug(payload.step, payload.status, body);
  } catch {
    // Never block product flow on analytics.
  }
}
