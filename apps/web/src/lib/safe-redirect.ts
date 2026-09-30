/**
 * Returns the path only if it stays on this site. Browsers treat `//host` and `/\host` as external,
 * and strip tabs/newlines before parsing, so `/\t/host` becomes `//host`.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
