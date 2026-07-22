import {
  compareIsoDates,
  getStatementSettlement,
  type CreditCardBillingConfig,
  type StatementSettlementTransaction,
} from "@/lib/finance/credit-card-billing";
import {
  resolveInvoicePaymentCycleAnchors,
  type InvoicePaymentCycleResolveContext,
} from "./invoice-payment-cycle-target";
import {
  amountsMatchForInvoiceReconcile,
  getInvoicePaymentDateDiffDays,
} from "./suggest-invoice-payment-reconcile";

export type InvoicePaymentSuggestionConfidence = "high" | "medium" | "low";

export type InvoicePaymentSuggestionConfidenceResult = {
  confidence: InvoicePaymentSuggestionConfidence;
  message: string;
};

const MONEY_EPSILON = 0.005;

export function getInvoicePaymentSuggestionConfidenceMessage(
  confidence: InvoicePaymentSuggestionConfidence,
): string {
  if (confidence === "high") {
    return "Sugestão com alta confiança — fatura anterior costuma ser a opção certa aqui.";
  }

  if (confidence === "medium") {
    return "Sugestão com confiança média — revise o ciclo antes de continuar.";
  }

  return "Sugestão com baixa confiança — confira se o ciclo está correto.";
}

/**
 * Classifies how trustworthy the automatic "fatura anterior" suggestion is,
 * using payment timing, cycle context and amount vs. the suggested bill.
 */
export function classifyImportedInvoicePaymentSuggestionConfidence(input: {
  billingConfig: CreditCardBillingConfig;
  cardAccountId: string;
  paymentDate: string;
  creditAmount: number;
  transactions: StatementSettlementTransaction[];
  referenceDate?: string;
  context?: InvoicePaymentCycleResolveContext | null;
}): InvoicePaymentSuggestionConfidenceResult | null {
  if (!(input.creditAmount > 0)) {
    return null;
  }

  const { previous: cycle } = resolveInvoicePaymentCycleAnchors(
    input.billingConfig,
    input.paymentDate,
    input.context,
  );
  const referenceDate = input.referenceDate ?? input.paymentDate;

  const settlement = getStatementSettlement({
    accountId: input.cardAccountId,
    config: input.billingConfig,
    cycle,
    transactions: input.transactions,
    referenceDate,
  });

  let score = 70;

  const onClosingDay =
    compareIsoDates(input.paymentDate, cycle.closingDate) === 0;
  const inPaymentWindow =
    compareIsoDates(input.paymentDate, cycle.closingDate) >= 0 &&
    compareIsoDates(input.paymentDate, cycle.dueDate) <= 0;
  const daysAfterDue =
    compareIsoDates(input.paymentDate, cycle.dueDate) > 0
      ? getInvoicePaymentDateDiffDays(cycle.dueDate, input.paymentDate)
      : 0;
  const daysAfterClosing =
    compareIsoDates(input.paymentDate, cycle.closingDate) > 0
      ? getInvoicePaymentDateDiffDays(cycle.closingDate, input.paymentDate)
      : 0;

  if (inPaymentWindow) {
    score += 20;
  }

  if (onClosingDay) {
    score -= 20;
  } else if (daysAfterClosing > 0 && daysAfterClosing <= 3) {
    score += 5;
  }

  if (daysAfterDue > 0 && daysAfterDue <= 7) {
    score -= 10;
  } else if (daysAfterDue > 7) {
    score -= 25;
  }

  if (settlement.amountDueTotal <= MONEY_EPSILON) {
    score -= 50;
  } else if (settlement.remainingTotal <= MONEY_EPSILON) {
    score -= 45;
  } else if (
    amountsMatchForInvoiceReconcile(input.creditAmount, settlement.remainingTotal)
  ) {
    score += 25;
  } else if (input.creditAmount > settlement.remainingTotal + MONEY_EPSILON) {
    const overpayRatio = input.creditAmount / settlement.remainingTotal;
    score -= overpayRatio > 1.5 ? 30 : 15;
  }

  const confidence = scoreToConfidence(score);

  return {
    confidence,
    message: getInvoicePaymentSuggestionConfidenceMessage(confidence),
  };
}

function scoreToConfidence(
  score: number,
): InvoicePaymentSuggestionConfidence {
  if (score >= 85) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}
