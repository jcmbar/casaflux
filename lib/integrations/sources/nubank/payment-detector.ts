const INSTALLMENT_PATTERN = /Parcela\s+(\d+\/\d+)/i;
const RENEGOTIATION_TITLE_PATTERN = /^renegocia[cç][aã]o de pend[eê]ncias/i;
const OVERDUE_BALANCE_TITLE_PATTERN = /^saldo em atraso$/i;
const EARLY_PIX_DISCOUNT_TITLE_PATTERN =
  /^desconto de antecipa[cç][aã]o de pagamento de pix/i;

export function isNubankInvoicePayment(title: string): boolean {
  return title.trim() === "Pagamento recebido";
}

export function isNubankIofFee(title: string): boolean {
  const normalized = title.trim();
  return (
    normalized === "IOF de compra internacional" ||
    normalized.startsWith("IOF de compra internacional")
  );
}

/**
 * Accounting wipe / re-book lines from Nubank debt renegotiation.
 * Including the credit wipe while also keeping "Saldo em atraso" and the new
 * installment crushes "Total da fatura" far below the app bill total.
 */
export function isNubankRenegotiationPackageLine(title: string): boolean {
  const normalized = title.trim();
  return (
    RENEGOTIATION_TITLE_PATTERN.test(normalized) ||
    OVERDUE_BALANCE_TITLE_PATTERN.test(normalized)
  );
}

/**
 * Early PIX payment discount — Nubank surfaces this under "Pagamento antecipado",
 * not as a merchant credit that should shrink the statement purchase total.
 */
export function isNubankEarlyPaymentDiscount(title: string): boolean {
  return EARLY_PIX_DISCOUNT_TITLE_PATTERN.test(title.trim());
}

/**
 * Rows that must not enter the CSV net used as issuer `amount_due` /
 * "Total da fatura" on import review.
 */
export function shouldExcludeFromNubankCardStatementTotal(
  title: string,
): boolean {
  return (
    isNubankRenegotiationPackageLine(title) ||
    isNubankEarlyPaymentDiscount(title)
  );
}

export function extractInstallment(title: string): string | undefined {
  const match = title.match(INSTALLMENT_PATTERN);
  return match?.[1];
}

export function hasInstallment(title: string): boolean {
  return INSTALLMENT_PATTERN.test(title);
}
