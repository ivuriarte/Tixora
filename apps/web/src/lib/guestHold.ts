/**
 * Helpers for the guest checkout hold: deadline wording, resume-link fragments and the
 * rules the screens share. Pure functions only, so they can be tested without a browser.
 *
 * Design rules (docs/specs/guest-checkout-hold-and-resume-link.md):
 *  - one date format everywhere: `Sat, Oct 3, 2026 · 9:30 AM`, always Philippine time;
 *  - the banner shows a date when more than 2 hours remain, `1 hr 12 min` from 60 to 120
 *    minutes and `42:10` under an hour;
 *  - a copied or emailed link keeps its secret in the URL fragment, which is removed from
 *    the address bar before anything else runs.
 */

export const MANILA_TIMEZONE = 'Asia/Manila';

const TWO_HOURS_SECONDS = 2 * 60 * 60;
const ONE_HOUR_SECONDS = 60 * 60;

/** `Sat, Oct 3, 2026 · 9:30 AM` in Philippine time, whatever timezone the phone is set to. */
export function formatHoldDeadline(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MANILA_TIMEZONE,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')} · ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** `42:10` (minutes and seconds). */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** `1 hr 12 min`, or `2 hr` when there are no spare minutes. */
export function formatHoursMinutes(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export type HoldDisplay =
  | { mode: 'expired'; seconds: 0 }
  | { mode: 'countdown'; seconds: number; text: string; urgent: boolean }
  | { mode: 'hours'; seconds: number; text: string }
  | { mode: 'date'; seconds: number; text: string };

/**
 * What the hold banner should say right now. Returns null when the registration has no
 * deadline (logged-in users and older rows), so no banner is shown.
 */
export function describeHold(deadlineIso: string | null | undefined, nowMs: number = Date.now()): HoldDisplay | null {
  if (!deadlineIso) return null;
  const deadline = new Date(deadlineIso).getTime();
  if (!Number.isFinite(deadline)) return null;
  const seconds = Math.floor((deadline - nowMs) / 1000);
  if (seconds <= 0) return { mode: 'expired', seconds: 0 };
  if (seconds > TWO_HOURS_SECONDS) return { mode: 'date', seconds, text: formatHoldDeadline(deadlineIso) };
  if (seconds >= ONE_HOUR_SECONDS) return { mode: 'hours', seconds, text: formatHoursMinutes(seconds) };
  return { mode: 'countdown', seconds, text: formatCountdown(seconds), urgent: seconds < 5 * 60 };
}

/** Screen-reader announcements fire only at these thresholds (10, 5 and 1 minute left). */
export const ANNOUNCE_THRESHOLDS_SECONDS = [600, 300, 60] as const;

/** The threshold just crossed between two readings, if any. */
export function crossedAnnouncement(previousSeconds: number, currentSeconds: number): number | null {
  for (const threshold of ANNOUNCE_THRESHOLDS_SECONDS) {
    if (previousSeconds > threshold && currentSeconds <= threshold) return threshold;
  }
  return null;
}

export function announcementText(thresholdSeconds: number): string {
  const minutes = Math.round(thresholdSeconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left to upload your payment proof.`;
}

/** URL without its fragment, for analytics. Fragments can hold a reservation secret. */
export function stripFragment(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

/** `j***@example.com` for showing where a link was sent. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}***@${domain}`;
}

export type ResumeFragment =
  | { kind: 'emailed'; token: string }
  | { kind: 'copied'; registrationId: string; accessToken: string }
  | { kind: 'none' };

const EMAILED_PATTERN = /^v1\.[0-9a-f-]{36}\.\d{1,13}\.[A-Za-z0-9_-]{43}$/;
const REGISTRATION_ID_PATTERN = /^[0-9a-f-]{36}$/;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

/** Reads `#t=<signed token>` (emailed) or `#r=<id>.<access token>` (copied). Anything else is "none". */
export function parseResumeFragment(hash: string): ResumeFragment {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const separator = raw.indexOf('=');
  if (separator === -1) return { kind: 'none' };
  const key = raw.slice(0, separator);
  const value = raw.slice(separator + 1);

  if (key === 't' && EMAILED_PATTERN.test(value)) return { kind: 'emailed', token: value };
  if (key === 'r') {
    const dot = value.indexOf('.');
    const registrationId = value.slice(0, dot);
    const accessToken = value.slice(dot + 1);
    if (dot > 0 && REGISTRATION_ID_PATTERN.test(registrationId) && ACCESS_TOKEN_PATTERN.test(accessToken)) {
      return { kind: 'copied', registrationId, accessToken };
    }
  }
  return { kind: 'none' };
}

/** The link "Copy my link" produces. Works in any browser while the hold lasts. */
export function buildCopyLink(origin: string, slug: string, registrationId: string, accessToken: string): string {
  return `${origin}/events/${slug}/register/resume#r=${registrationId}.${accessToken}`;
}

/** What to show after the reservation could not be loaded (a 404 from the API). */
export function classifyMissingReservation(
  knownDeadlineIso: string | null | undefined,
  nowMs: number = Date.now(),
): 'expired' | 'elsewhere' {
  if (knownDeadlineIso) {
    const deadline = new Date(knownDeadlineIso).getTime();
    if (Number.isFinite(deadline) && deadline <= nowMs) return 'expired';
  }
  return 'elsewhere';
}

// ── The hold this browser already started for an event (convenience only) ──────────────

export interface RememberedHold {
  registrationId: string;
  tierId: string;
  qty: number;
}

const HOLD_STORAGE_PREFIX = 'axon_guest_hold_';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readRememberedHold(storage: StorageLike, eventId: string): RememberedHold | null {
  try {
    const raw = storage.getItem(`${HOLD_STORAGE_PREFIX}${eventId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedHold>;
    if (
      typeof parsed.registrationId === 'string' &&
      typeof parsed.tierId === 'string' &&
      typeof parsed.qty === 'number'
    ) {
      return { registrationId: parsed.registrationId, tierId: parsed.tierId, qty: parsed.qty };
    }
  } catch {
    // Unreadable or blocked storage: behave as if nothing was remembered.
  }
  return null;
}

export function rememberHold(storage: StorageLike, eventId: string, hold: RememberedHold): void {
  try {
    storage.setItem(`${HOLD_STORAGE_PREFIX}${eventId}`, JSON.stringify(hold));
  } catch {
    // Storage can be unavailable (private windows, in-app browsers); the hold still works.
  }
}

export function forgetHold(storage: StorageLike, eventId: string): void {
  try {
    storage.removeItem(`${HOLD_STORAGE_PREFIX}${eventId}`);
  } catch {
    // Nothing to do.
  }
}

// ── The last deadline this browser saw for a reservation (to tell expired from elsewhere) ──

const DEADLINE_STORAGE_PREFIX = 'axon_guest_deadline_';

export function rememberDeadline(storage: StorageLike, registrationId: string, deadlineIso: string | null): void {
  try {
    if (deadlineIso) storage.setItem(`${DEADLINE_STORAGE_PREFIX}${registrationId}`, deadlineIso);
    else storage.removeItem(`${DEADLINE_STORAGE_PREFIX}${registrationId}`);
  } catch {
    // Unavailable storage only means we fall back to the neutral wording.
  }
}

export function readRememberedDeadline(storage: StorageLike, registrationId: string): string | null {
  try {
    return storage.getItem(`${DEADLINE_STORAGE_PREFIX}${registrationId}`);
  } catch {
    return null;
  }
}

/** Fields of an API error the screens branch on. */
export interface ApiFailure {
  status: number | null;
  code: string | null;
  message: string | null;
}

export function readApiFailure(error: unknown): ApiFailure {
  const response = (error as { response?: { status?: number; data?: { code?: unknown; message?: unknown } } })?.response;
  const message = response?.data?.message;
  return {
    status: typeof response?.status === 'number' ? response.status : null,
    code: typeof response?.data?.code === 'string' ? response.data.code : null,
    message: Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : null,
  };
}
