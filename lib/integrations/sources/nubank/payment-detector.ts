import {
  extractInstallmentFromTitle,
  classifyNubankStatementLine,
} from "@/lib/integrations/sources/nubank/statement-line-kind";

const INSTALLMENT_PATTERN = /Parcela\s+(\d+\/\d+)/i;

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

export function extractInstallment(title: string): string | undefined {
  return extractInstallmentFromTitle(title) ?? undefined;
}

export function hasInstallment(title: string): boolean {
  return INSTALLMENT_PATTERN.test(title);
}

/** @deprecated Prefer classifyNubankStatementLine — kept for older call sites. */
export function isNubankRenegotiationPackageLine(title: string): boolean {
  const kind = classifyNubankStatementLine({ title, amount: 1 });
  return (
    kind === "RENEGOTIATION_INSTALLMENT" ||
    kind === "PREVIOUS_BALANCE"
  );
}

/** @deprecated Prefer classifyNubankStatementLine. */
export function isNubankEarlyPaymentDiscount(title: string): boolean {
  return /^desconto de antecipa[cç][aã]o de pagamento/i.test(title.trim());
}

/**
 * @deprecated Totals now use buildNubankStatementInvoiceBreakdown.
 * Always returns false so legacy call sites stop excluding renegotiation.
 */
export function shouldExcludeFromNubankCardStatementTotal(
  _title: string,
): boolean {
  return false;
}
