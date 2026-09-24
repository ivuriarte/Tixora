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
 * Format a date, or a start–end date range, as a short human-readable string.
 * Same-day (or missing end date) collapses to a single date, e.g. "Sep 22, 2026".
 * Multi-day events show a range, e.g. "Sep 22 – 23, 2026" or "Dec 30, 2026 – Jan 2, 2027".
 */
export function formatDateRange(start: Date | string, end?: Date | string | null): string {
  const startDate = new Date(start);
  if (!end) return formatShortDate(startDate);

  const endDate = new Date(end);
  if (endDate <= startDate) return formatShortDate(startDate);

  const startParts = getManilaDateParts(startDate);
  const endParts = getManilaDateParts(endDate);

  if (startParts.year === endParts.year && startParts.month === endParts.month && startParts.day === endParts.day) {
    return formatShortDate(startDate);
  }

  if (startParts.year === endParts.year && startParts.month === endParts.month) {
    const monthYear = startDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', year: 'numeric' });
    const [monthLabel] = monthYear.split(' ');
    return `${monthLabel} ${startParts.day} – ${endParts.day}, ${startParts.year}`;
  }

  return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;
}

function getManilaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Return the number of seconds until a given date from now.
 * Returns 0 if the date is in the past.
 */
export function secondsUntil(date: Date | string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
}
