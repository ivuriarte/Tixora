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

/** Wait between two codes when the API does not say (it normally does; see readSendWaitSeconds). */
export const DEFAULT_OTP_WAIT_SECONDS = 60;

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

/**
 * How long to wait after a code was sent, as the API reports it in the send reply (with or
 * without the `data` envelope). Falls back to the default when it is missing or unreadable.
 */
export function readSendWaitSeconds(body: unknown): number {
  const outer = body as { data?: { retryAfterSeconds?: unknown }; retryAfterSeconds?: unknown } | null | undefined;
  const seconds = Number(outer?.data?.retryAfterSeconds ?? outer?.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(300, Math.ceil(seconds))
    : DEFAULT_OTP_WAIT_SECONDS;
}

/** A cooldown whose earlier code can still be entered, for an account the API named. */
export function canResumeCode(cooldown: OtpCooldown | null): cooldown is OtpCooldown & { userId: string } {
  return cooldown !== null && cooldown.codeActive && cooldown.userId !== null;
}
