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

  it("ignores renegotiation package and early-PIX discount in invoice total", () => {
    // Mirrors the Nu crédito 04.csv distortion: wipe credit + saldo/installment
    // previously crushed Total da fatura to ~551 instead of ~1.5k+.
    const rows = [
      buildRow({
        sourceLine: 1,
        kind: "card_purchase",
        direction: "out",
        amount: 598.78,
        description: "Jeniffer Calmon Muniz Calvo",
      }),
      buildRow({
        sourceLine: 2,
        kind: "card_purchase",
        direction: "in",
        amount: 12.28,
        description: "Estorno de juros de rotativo",
      }),
      buildRow({
        sourceLine: 3,
        kind: "card_purchase",
        direction: "in",
        amount: 3001.06,
        description: "Renegociação de pendências (02/Abril)",
      }),
      buildRow({
        sourceLine: 4,
        kind: "card_purchase",
        direction: "out",
        amount: 835.6,
        description: "Renegociação de pendências (02/Abril) - 1/5",
      }),
      buildRow({
        sourceLine: 5,
        kind: "card_purchase",
        direction: "out",
        amount: 1244.73,
        description: "Saldo em atraso",
      }),
      buildRow({
        sourceLine: 6,
        kind: "card_purchase",
        direction: "in",
        amount: 52.26,
        description:
          "Desconto de antecipação de pagamento de pix (Jeniffer Calmon Muniz Calvo)",
      }),
      buildRow({
        sourceLine: 7,
        kind: "card_invoice_payment",
        direction: "in",
        amount: 600,
        description: "Pagamento recebido",
      }),
      buildRow({
        sourceLine: 8,
        kind: "card_purchase",
        direction: "out",
        amount: 50,
        description: "Vivo Easy*Vivo Easy",
      }),
    ];

    expect(
      buildImportFinancialSummary({
        rows,
        source: "nubank_credit_card",
      }),
    ).toEqual({
      // 598.78 + 50 − 12.28 (estorno kept); renegotiation + early-PIX skipped
      invoiceTotal: 636.5,
      paymentsTotal: 600,
      paymentCount: 1,
      isCreditCardStatement: true,
    });
  });
});
