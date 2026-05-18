import { randomBytes } from 'crypto';

/**
 * Generate a unique registration reference number.
 * Format: PREFIX-YYYY-XXXXX (5 uppercase alphanumeric chars)
 * Example: AXN-2026-A3F7K
 * Entropy: 36^5 ≈ 60 million combinations per year.
 */
export function generateReferenceNumber(prefix = 'AXN'): string {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(5);
  const suffix = Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
  return `${prefix}-${year}-${suffix}`;
}
