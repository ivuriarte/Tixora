/**
 * Access token lives in memory only (XSS-safe).
 * Refresh token lives in localStorage (simpler; switch to HttpOnly cookie via BFF for production hardening).
 */

const REFRESH_TOKEN_KEY = 'axon_tickets_rt';

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

export function clearAuth(): void {
  _accessToken = null;
  if (typeof window !== 'undefined') localStorage.removeItem(REFRESH_TOKEN_KEY);
}
