const EXCLUDED_PREFIXES = ['/admin', '/auth', '/account', '/profile', '/checkout', '/registrations'];
// The resume page carries a reservation secret in its URL fragment: never send it to the pixel.
const EXCLUDED_PATTERNS = [/^\/events\/[^/]+\/register\/resume\/?$/];

/** True for pages the Meta Pixel must not track. */
export function isPixelExcludedPath(pathname: string): boolean {
  return (
    EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    EXCLUDED_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}
