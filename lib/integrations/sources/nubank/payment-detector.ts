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
  const match = title.match(INSTALLMENT_PATTERN);
  return match?.[1];
}

export function hasInstallment(title: string): boolean {
  return INSTALLMENT_PATTERN.test(title);
}
