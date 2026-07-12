/**
 * Format a number as Philippine Peso (PHP).
 * Example: formatPHP(1500) → "₱1,500.00"
 */
export function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * No-op kept for call-site compatibility. Amounts are now stored and
 * returned as pesos, so no conversion is needed.
 */
export function centavosToPeso(n: number): number {
  return n;
}

/**
 * No-op kept for call-site compatibility.
 */
export function pesoToCentavos(n: number): number {
  return n;
}

/**
 * Calculate Axon Tickets service fee (5% of subtotal, min ₱15).
 */
export function calculateFee(subtotal: number): number {
  const fee = subtotal * 0.05;
  return Math.max(Math.round(fee * 100) / 100, 15);
}
