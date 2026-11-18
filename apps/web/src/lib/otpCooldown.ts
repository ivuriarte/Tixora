/**
 * What the API says when a new confirmation or sign-in code is asked for too soon.
 * Every screen that sends a code reads it the same way, so none of them shows a stale
 * "please wait 60 seconds" error that outlives the wait.
 */
export interface OtpCooldown {
  /** Seconds left before another code can be requested for this address. */
  retryAfterSeconds: number;
  /** A code sent a moment ago can still be entered. */
  codeActive: boolean;
  /** Sent by the account sign-in API only, so the screen can carry on to the code step. */
  userId: string | null;
}

/** How long a code stays valid (the API keeps it for five minutes). */
export const OTP_LIFETIME_MS = 5 * 60_000;

export function readOtpCooldown(error: unknown): OtpCooldown | null {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data || data.code !== 'OTP_COOLDOWN') return null;
  const seconds = Number(data.retryAfterSeconds);
  return {
    retryAfterSeconds: Number.isFinite(seconds) ? Math.min(300, Math.max(1, Math.ceil(seconds))) : 60,
    codeActive: data.codeActive === true,
    userId: typeof data.userId === 'string' && data.userId ? data.userId : null,
  };
}

/** Whole seconds left until `untilMs`; 0 once it has passed. */
export function secondsUntil(untilMs: number, nowMs: number): number {
  return untilMs > nowMs ? Math.ceil((untilMs - nowMs) / 1000) : 0;
}
