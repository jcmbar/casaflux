import { describe, expect, it } from "vitest";

import { buildImportPreview } from "@/lib/integrations/core/import-orchestrator";
import {
  buildImportReviewContext,
  collectUniqueInvoicePeriodLabels,
} from "@/lib/integrations/core/import-review-context";
import { getCreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import { resolveImportedInvoicePaymentForAccount } from "@/lib/integrations/invoice-payment/resolve-invoice-payment";

describe("import review billing when card account is missing", () => {
  it("treats a missing selected card account as absent billing config", () => {
    expect(getCreditCardBillingConfig(null)).toBeNull();

    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 100,00"',
      ].join("\n"),
      cardAccountId: "missing-card-account",
    });

    const invoicePeriodLabels = collectUniqueInvoicePeriodLabels(
      preview.rows
        .filter((row) => row.kind === "card_invoice_payment")
        .map((row) =>
          resolveImportedInvoicePaymentForAccount({
            paymentDate: row.date,
            cardAccount: null,
          })?.periodLabel,
        ),
    );

    expect(invoicePeriodLabels).toEqual([]);

    const context = buildImportReviewContext({
      destinationAccountLabel: null,
      rows: preview.rows,
      invoicePeriodLabels,
    });

    expect(context?.invoicePeriodLabels).toEqual([]);
  });

  it("keeps billing config for a valid credit card account", () => {
    const config = getCreditCardBillingConfig({
      type: "credit_card",
      statement_closing_day: 25,
      statement_due_day: 3,
    });

    expect(config).toEqual({
      statementClosingDay: 25,
      statementDueDay: 3,
    });

    const resolution = resolveImportedInvoicePaymentForAccount({
      paymentDate: "2026-06-26",
      cardAccount: {
        type: "credit_card",
        statement_closing_day: 25,
        statement_due_day: 3,
      },
    });

    expect(resolution?.periodLabel).toBe("26/05–25/06");
  });
});
