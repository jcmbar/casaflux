import { roundMoney } from "@/lib/finance/credit-card-billing";
import { sumCardStatementPurchasesFromImportRows } from "@/lib/integrations/invoice-payment/capture-imported-statement-cycle";
import {
  getInvoicePaymentImportMode,
  type InvoicePaymentImportMode,
} from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import type { ImportPreviewRow, ImportSource } from "@/lib/integrations/types";

export type ImportFinancialSummary = {
  /** Net purchases for the statement file (excludes invoice payments). */
  invoiceTotal: number;
  /** Sum of credits treated as invoice payments. */
  paymentsTotal: number;
  paymentCount: number;
  isCreditCardStatement: boolean;
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
}): ImportFinancialSummary | null {
  if (!isCreditCardImportSource(input.source)) {
    return null;
  }

  const modes = input.invoicePaymentModes ?? {};
  const payments = sumInvoicePaymentCreditsFromImportRows(input.rows, modes);

  return {
    invoiceTotal: sumCardStatementPurchasesFromImportRows(input.rows, modes),
    paymentsTotal: payments.total,
    paymentCount: payments.count,
    isCreditCardStatement: true,
  };
}
