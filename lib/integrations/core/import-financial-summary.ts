import { roundMoney } from "@/lib/finance/credit-card-billing";
import { buildCardStatementInvoiceBreakdownFromImportRows } from "@/lib/integrations/invoice-payment/capture-imported-statement-cycle";
import {
  getInvoicePaymentImportMode,
  type InvoicePaymentImportMode,
} from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import type { NubankStatementInvoiceGroups } from "@/lib/integrations/sources/nubank/statement-invoice";
import type { ImportPreviewRow, ImportSource } from "@/lib/integrations/types";

export type ImportFinancialSummary = {
  /**
   * Best estimate of this statement's official bill total from the CSV itself
   * (typed groups + payments applied after the previous due).
   * N+1 enrich may still refine a *prior* cycle's amount_due separately.
   */
  invoiceTotal: number;
  /** Sum of credits treated as invoice payments (all Pagamento recebido). */
  paymentsTotal: number;
  paymentCount: number;
  /** Payments that reduced this file's invoiceTotal. */
  paymentsAppliedToBill: number;
  /** Payments treated as settlement of the previous bill. */
  paymentsForPriorBill: number;
  isCreditCardStatement: boolean;
  /** Financial groups when source is Nubank CC. */
  groups: NubankStatementInvoiceGroups | null;
  closingDate: string | null;
};

export function isCreditCardImportSource(
  source: ImportSource | null | undefined,
): boolean {
  return source === "nubank_credit_card";
}

export function sumInvoicePaymentCreditsFromImportRows(
  rows: ImportPreviewRow[],
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
): { total: number; count: number } {
  let total = 0;
  let count = 0;

  for (const row of rows) {
    if (row.kind !== "card_invoice_payment") {
      continue;
    }

    if (
      getInvoicePaymentImportMode(invoicePaymentModes, row.sourceLine) !==
      "payment"
    ) {
      continue;
    }

    const amount = Math.abs(Number(row.amount));
    if (!Number.isFinite(amount)) {
      continue;
    }

    total += amount;
    count += 1;
  }

  return { total: roundMoney(total), count };
}

export function buildImportFinancialSummary(input: {
  rows: ImportPreviewRow[];
  source: ImportSource | null | undefined;
  invoicePaymentModes?: Record<number, InvoicePaymentImportMode>;
  statementDueDay?: number | null;
}): ImportFinancialSummary | null {
  if (!isCreditCardImportSource(input.source)) {
    return null;
  }

  const modes = input.invoicePaymentModes ?? {};
  const payments = sumInvoicePaymentCreditsFromImportRows(input.rows, modes);
  const breakdown = buildCardStatementInvoiceBreakdownFromImportRows(
    input.rows,
    modes,
    { statementDueDay: input.statementDueDay },
  );

  return {
    invoiceTotal: breakdown.amountDue,
    paymentsTotal: payments.total,
    paymentCount: payments.count,
    paymentsAppliedToBill: breakdown.paymentsAppliedToBill,
    paymentsForPriorBill: breakdown.paymentsForPriorBill,
    isCreditCardStatement: true,
    groups: breakdown.groups,
    closingDate: breakdown.closingDate,
  };
}
