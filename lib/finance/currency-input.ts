/** Parse raw digit string into integer cents (e.g. "1234" → 1234 cents = R$ 12,34). */
export function parseDigitsToCents(digits: string): number {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return 0;

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Format cents as Brazilian decimal display without currency symbol (e.g. 1234 → "12,34"). */
export function formatCentsDisplay(cents: number): string {
  const safe = Math.max(0, Math.floor(cents));
  return (safe / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Convert integer cents to numeric amount for storage (e.g. 1234 → 12.34). */
export function centsToAmount(cents: number): number {
  return Math.max(0, cents) / 100;
}

export function isPositiveCents(cents: number): boolean {
  return cents > 0;
}
