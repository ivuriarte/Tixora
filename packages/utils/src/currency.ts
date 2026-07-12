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
 * Compatibility helpers for legacy call sites.
 * Money values are stored and returned as PHP pesos.
 */
export function centavosToPeso(amount: number): number {
  return amount;
}

export function pesoToCentavos(amount: number): number {
  return amount;
}

/**
 * Calculate Axon Tickets service fee (5% of subtotal, min ₱15).
 */
export function calculateFee(subtotal: number): number {
  const fee = subtotal * 0.05;
  return Math.max(Math.round(fee * 100) / 100, 15);
}
