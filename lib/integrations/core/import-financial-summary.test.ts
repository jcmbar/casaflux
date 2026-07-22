import { describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "../types";
import { buildImportFinancialSummary } from "./import-financial-summary";

function buildRow(
  partial: Partial<ImportPreviewRow> &
    Pick<ImportPreviewRow, "sourceLine" | "kind" | "direction" | "amount">,
): ImportPreviewRow {
  return {
    source: "nubank_credit_card",
    date: "2026-07-01",
    description: "Test",
    externalFingerprint: `fp-${partial.sourceLine}`,
    externalId: null,
    metadata: {},
    reviewStatus: "ready",
    historicalStatus: "new",
    categoryStatus: "none",
    confirmedCategoryId: null,
    ...partial,
  };
}

describe("buildImportFinancialSummary", () => {
  it("returns null for checking imports", () => {
    expect(
      buildImportFinancialSummary({
        rows: [],
        source: "nubank_checking",
      }),
    ).toBeNull();
  });

  it("highlights invoice total and payment credits for credit-card CSV", () => {
    const rows = [
      buildRow({
        sourceLine: 1,
        kind: "card_purchase",
        direction: "out",
        amount: 100,
      }),
      buildRow({
        sourceLine: 2,
        kind: "card_purchase",
        direction: "out",
        amount: 50,
      }),
      buildRow({
        sourceLine: 3,
        kind: "card_purchase",
        direction: "in",
        amount: 10,
      }),
      buildRow({
        sourceLine: 4,
        kind: "card_invoice_payment",
        direction: "in",
        amount: 200,
      }),
    ];

    expect(
      buildImportFinancialSummary({
        rows,
        source: "nubank_credit_card",
      }),
    ).toEqual({
      invoiceTotal: 140,
      paymentsTotal: 200,
      paymentCount: 1,
      isCreditCardStatement: true,
    });
  });

  it("excludes invoice payments marked as common from payments total", () => {
    const rows = [
      buildRow({
        sourceLine: 1,
        kind: "card_purchase",
        direction: "out",
        amount: 80,
      }),
      buildRow({
        sourceLine: 2,
        kind: "card_invoice_payment",
        direction: "in",
        amount: 80,
      }),
    ];

    // Common credits stay in the statement net (purchase − credit = 0 here)
    // and do not count as invoice payments.
    expect(
      buildImportFinancialSummary({
        rows,
        source: "nubank_credit_card",
        invoicePaymentModes: { 2: "common" },
      }),
    ).toEqual({
      invoiceTotal: 0,
      paymentsTotal: 0,
      paymentCount: 0,
      isCreditCardStatement: true,
    });
  });
});
