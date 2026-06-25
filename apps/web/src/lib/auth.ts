/**
 * Access token lives in memory only (XSS-safe).
 * Refresh token lives in localStorage (simpler; switch to HttpOnly cookie via BFF for production hardening).
 */

const REFRESH_TOKEN_KEY = 'axon_tickets_rt';
const LOGIN_PORTAL_KEY = 'axon_tickets_portal';

let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string): void {
  _accessToken = token;
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function getLoginPortal(): 'customer' | 'organizer' | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(LOGIN_PORTAL_KEY);
  return v === 'organizer' ? 'organizer' : v === 'customer' ? 'customer' : null;
}

export function setLoginPortal(portal: 'customer' | 'organizer'): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOGIN_PORTAL_KEY, portal);
}

export function clearAuth(): void {
  _accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(LOGIN_PORTAL_KEY);
  }
}
