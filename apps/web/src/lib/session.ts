import axios from 'axios';
import { getRefreshToken, setAccessToken, setRefreshToken } from './auth';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';

const REFRESH_LOCK = 'axon_tickets:session-refresh';

export type SessionTokens = { accessToken: string; refreshToken: string };

/** The refresh token was rejected by the server; the user must sign in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

let inFlight: Promise<SessionTokens> | null = null;

function isUnauthorized(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401;
}

async function postRefresh(refreshToken: string): Promise<SessionTokens> {
  const res = await axios.post<{ data: SessionTokens }>(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 30_000 },
  );
  return res.data.data;
}

async function rotate(): Promise<SessionTokens> {
  const sent = getRefreshToken();
  if (!sent) throw new SessionExpiredError();

  let tokens: SessionTokens;
  try {
    tokens = await postRefresh(sent);
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
    // Without Web Locks, another tab can rotate the single-use token while this request is in flight.
    const latest = getRefreshToken();
    if (!latest || latest === sent) throw new SessionExpiredError();
    try {
      tokens = await postRefresh(latest);
    } catch (retryErr) {
      if (isUnauthorized(retryErr)) throw new SessionExpiredError();
      throw retryErr;
    }
  }

  setAccessToken(tokens.accessToken);
  setRefreshToken(tokens.refreshToken);
  return tokens;
}

/**
 * Exchanges the stored refresh token for a new pair. Calls are de-duplicated within a tab and
 * serialized across tabs, because the server revokes each refresh token on first use.
 * Rejects with SessionExpiredError only when the server rejects the token; network errors pass through.
 */
export function refreshSession(): Promise<SessionTokens> {
  if (inFlight) return inFlight;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const run: Promise<SessionTokens> = locks
    ? locks.request(REFRESH_LOCK, () => rotate()).then((pendingTokens) => pendingTokens)
    : rotate();
  const pending = run.finally(() => {
    inFlight = null;
  });
  inFlight = pending;
  return pending;
}

export function sessionExpiredLoginUrl(
  pathname: string,
  search: string,
  portal: 'customer' | 'organizer' | null,
): string {
  if (pathname.startsWith('/auth')) {
    if (portal === 'organizer') return '/auth/organizer';
    return pathname.startsWith('/auth/admin') ? '/auth/admin' : '/auth/login';
  }
  const redirect = encodeURIComponent(`${pathname}${search}`);
  // Password sign-in doesn't record a portal; OTP sign-in records 'customer' (admins included) or 'organizer'.
  if (pathname.startsWith('/admin') && portal !== 'customer') {
    return `${portal === 'organizer' ? '/auth/organizer' : '/auth/admin'}?redirect=${redirect}`;
  }
  return `/auth/login?redirect=${redirect}`;
}
