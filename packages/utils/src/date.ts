/**
 * Format a date as a human-readable Manila (Asia/Manila) date-time string.
 */
export function formatManila(date: Date | string): string {
  return new Date(date).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date as a short date string (e.g. "Jan 15, 2025").
 */
export function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Return the number of seconds until a given date from now.
 * Returns 0 if the date is in the past.
 */
export function secondsUntil(date: Date | string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
}
