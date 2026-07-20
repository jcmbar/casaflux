import {
  formatFullBrDate,
  formatStatementPeriodLabel,
  getCreditCardBillingConfig,
  getStatementCyclePaidByPaymentDate,
  type CreditCardBillingConfig,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";
import type { Account } from "@/types/account";
import type { ImportDirection, ImportPreviewRow } from "../types";
import { isNubankInvoicePayment } from "../sources/nubank/payment-detector";

export type InvoicePaymentImportMode = "payment" | "common";

export type ImportedInvoicePaymentResolution = {
  /** Closing-date ISO of the statement being settled. */
  cycleId: string;
  cycle: StatementCycle;
  /** Human label for the paid statement period. */
  periodLabel: string;
  dueDateLabel: string;
  confidence: "high";
  summary: string;
};

/**
 * Strict Nubank credit-card invoice payment candidate:
 * exact title + credit (CSV negative / direction in). Avoids false positives.
 */
export function isCreditCardInvoicePaymentCandidate(input: {
  description: string;
  direction: ImportDirection;
  source?: string;
}): boolean {
  if (input.source && input.source !== "nubank_credit_card") {
    return false;
  }

  return (
    isNubankInvoicePayment(input.description) && input.direction === "in"
  );
}

/**
 * Resolves which statement a card CSV payment settles.
 * Payment date → latest cycle with closingDate <= paymentDate (typically the
 * previous closed statement relative to the accumulating open cycle).
 */
export function resolveImportedInvoicePayment(input: {
  paymentDate: string;
  billingConfig: CreditCardBillingConfig | null;
}): ImportedInvoicePaymentResolution | null {
  if (!input.billingConfig) {
    return null;
  }

  const cycle = getStatementCyclePaidByPaymentDate(
    input.billingConfig,
    input.paymentDate,
  );

  return {
    cycleId: cycle.cycleId,
    cycle,
    periodLabel: formatStatementPeriodLabel(cycle),
    dueDateLabel: formatFullBrDate(cycle.dueDate),
    confidence: "high",
    summary: `Fatura ${formatStatementPeriodLabel(cycle)} (vence ${formatFullBrDate(cycle.dueDate)})`,
  };
}

export function resolveImportedInvoicePaymentForAccount(input: {
  paymentDate: string;
  cardAccount: Pick<
    Account,
    "type" | "statement_closing_day" | "statement_due_day"
  > | null;
}): ImportedInvoicePaymentResolution | null {
  if (!input.cardAccount) {
    return null;
  }

  return resolveImportedInvoicePayment({
    paymentDate: input.paymentDate,
    billingConfig: getCreditCardBillingConfig(input.cardAccount),
  });
}

export function getInvoicePaymentImportMode(
  modes: Record<number, InvoicePaymentImportMode>,
  sourceLine: number,
): InvoicePaymentImportMode {
  return modes[sourceLine] ?? "payment";
}

export function isInvoicePaymentRowPending(input: {
  row: ImportPreviewRow;
  mode: InvoicePaymentImportMode;
  sourceAccountId?: string;
}): boolean {
  if (input.row.kind !== "card_invoice_payment") {
    return false;
  }

  if (input.mode === "common") {
    return false;
  }

  return !input.sourceAccountId;
}
