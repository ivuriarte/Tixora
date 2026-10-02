import axios from 'axios';

/** The server's own message for a refused request (4xx), or the fallback for anything else. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) return fallback;
  const message = (error.response.data as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message.trim() && message !== 'Validation failed' ? message : fallback;
}

/** Per-item reasons the server returned with a refused request, if any. */
export function apiErrorList(error: unknown): string[] {
  if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) return [];
  const errors = (error.response.data as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(errors) ? errors.filter((item): item is string => typeof item === 'string') : [];
}
