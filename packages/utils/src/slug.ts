/**
 * Generate a URL-safe slug from a title.
 * Handles Filipino characters and common punctuation.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Generate a unique slug by appending a short random suffix.
 */
export function uniqueSlug(title: string): string {
  const base = slugify(title);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
