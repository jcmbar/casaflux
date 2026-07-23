export function formatCurrency(
  value: number,
  locale = "pt-BR",
  currency = "BRL",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}

/** Stable mask for privacy mode — never reveals magnitude. */
export const HIDDEN_CURRENCY_PLACEHOLDER = "R$ ••••";

export function formatCurrencyOrHidden(
  value: number,
  hideAmounts: boolean,
  locale = "pt-BR",
  currency = "BRL",
): string {
  if (hideAmounts) {
    return HIDDEN_CURRENCY_PLACEHOLDER;
  }
  return formatCurrency(value, locale, currency);
}

export function formatDate(
  value: string | Date,
  locale = "pt-BR",
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  },
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatPercent(value: number, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}
