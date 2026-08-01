/**
 * Fine-grained Nubank credit-card statement line kinds.
 * Coarse `NormalizedImportKind` stays for commit/RPC compatibility.
 */
export type NubankStatementLineKind =
  | "PURCHASE"
  | "INSTALLMENT"
  | "PAYMENT"
  | "INTEREST"
  | "IOF"
  | "LATE_FEE"
  | "PREVIOUS_BALANCE"
  | "REVOLVING_BALANCE"
  | "PENDING_PREVIOUS_MONTH"
  | "RENEGOTIATION_INSTALLMENT"
  | "RENEGOTIATION_CREDIT"
  | "CREDIT"
  | "ADJUSTMENT"
  | "UNKNOWN";

const INSTALLMENT_PATTERN = /Parcela\s+(\d+\/\d+)/i;
const RENEGOTIATION_PATTERN = /^renegocia[cç][aã]o de pend[eê]ncias/i;
const PENDING_PREVIOUS_PATTERN =
  /^valor pendente do m[eê]s anterior(\s*\(rotativo\))?$/i;

export function extractInstallmentFromTitle(title: string): string | undefined {
  const match = title.match(INSTALLMENT_PATTERN);
  return match?.[1];
}

/**
 * Classify a Nubank CC CSV title (+ signed amount for renegotiation polarity).
 * Amount sign: positive = charge (out), negative = credit/payment (in).
 */
export function classifyNubankStatementLine(input: {
  title: string;
  amount: number;
}): NubankStatementLineKind {
  const title = input.title.trim();
  const amount = Number(input.amount);

  if (title === "Pagamento recebido") {
    return "PAYMENT";
  }

  if (RENEGOTIATION_PATTERN.test(title)) {
    return amount < 0 ? "RENEGOTIATION_CREDIT" : "RENEGOTIATION_INSTALLMENT";
  }

  if (/^saldo em atraso$/i.test(title)) {
    return "PREVIOUS_BALANCE";
  }

  if (/^saldo em rotativo$/i.test(title)) {
    return "REVOLVING_BALANCE";
  }

  if (PENDING_PREVIOUS_PATTERN.test(title)) {
    return "PENDING_PREVIOUS_MONTH";
  }

  if (/^juros\b/i.test(title)) {
    return "INTEREST";
  }

  if (/^multa\b/i.test(title)) {
    return "LATE_FEE";
  }

  if (/^iof\b/i.test(title)) {
    return "IOF";
  }

  if (/^estorno\b/i.test(title) || /^desconto\b/i.test(title)) {
    return "CREDIT";
  }

  if (/^ajuste\b/i.test(title)) {
    return "ADJUSTMENT";
  }

  if (INSTALLMENT_PATTERN.test(title)) {
    return "INSTALLMENT";
  }

  if (!title) {
    return "UNKNOWN";
  }

  return "PURCHASE";
}

/** Whether this fine kind should post as consumer spend (compras/parcelas). */
export function isNubankConsumptionLineKind(
  kind: NubankStatementLineKind,
): boolean {
  return kind === "PURCHASE" || kind === "INSTALLMENT";
}

/** Carried balances from prior cycles shown on this statement. */
export function isNubankCarriedBalanceLineKind(
  kind: NubankStatementLineKind,
): boolean {
  return (
    kind === "PREVIOUS_BALANCE" ||
    kind === "REVOLVING_BALANCE" ||
    kind === "PENDING_PREVIOUS_MONTH"
  );
}

/** Fees / charges that are not merchant consumption. */
export function isNubankFeeLineKind(kind: NubankStatementLineKind): boolean {
  return kind === "INTEREST" || kind === "IOF" || kind === "LATE_FEE";
}
