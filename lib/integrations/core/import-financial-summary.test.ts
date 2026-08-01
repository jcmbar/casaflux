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

  it("applies payments after previous due to the invoice total", () => {
    const rows = [
      buildRow({
        sourceLine: 1,
        kind: "card_purchase",
        direction: "out",
        amount: 100,
        date: "2026-07-10",
      }),
      buildRow({
        sourceLine: 2,
        kind: "card_purchase",
        direction: "out",
        amount: 50,
        date: "2026-07-12",
      }),
      buildRow({
        sourceLine: 3,
        kind: "card_purchase",
        direction: "in",
        amount: 10,
        description: "Estorno parcial",
        date: "2026-07-12",
      }),
      // After previous due → reduces this bill.
      buildRow({
        sourceLine: 4,
        kind: "card_invoice_payment",
        direction: "in",
        amount: 40,
        description: "Pagamento recebido",
        date: "2026-07-15",
      }),
    ];

    const summary = buildImportFinancialSummary({
      rows,
      source: "nubank_credit_card",
      statementDueDay: 1,
    });

    expect(summary).toMatchObject({
      // 100 + 50 − 10 − 40
      invoiceTotal: 100,
      paymentsTotal: 40,
      paymentCount: 1,
      paymentsAppliedToBill: 40,
      isCreditCardStatement: true,
    });
    expect(summary?.groups?.consumption).toBe(150);
    expect(summary?.groups?.credits).toBe(10);
  });

  it("does not apply prior-due payments to the invoice total", () => {
    const rows = [
      buildRow({
        sourceLine: 1,
        kind: "card_purchase",
        direction: "out",
        amount: 200,
        date: "2026-07-10",
      }),
      // On/before inferred previous due → prior settlement only.
      buildRow({
        sourceLine: 2,
        kind: "card_invoice_payment",
        direction: "in",
        amount: 150,
        description: "Pagamento recebido",
        date: "2026-06-01",
      }),
    ];

    const summary = buildImportFinancialSummary({
      rows,
      source: "nubank_credit_card",
      statementDueDay: 1,
    });

    expect(summary).toMatchObject({
      invoiceTotal: 200,
      paymentsTotal: 150,
      paymentsAppliedToBill: 0,
      paymentsForPriorBill: 150,
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

    expect(
      buildImportFinancialSummary({
        rows,
        source: "nubank_credit_card",
        invoicePaymentModes: { 2: "common" },
      }),
    ).toMatchObject({
      invoiceTotal: 0,
      paymentsTotal: 0,
      paymentCount: 0,
      isCreditCardStatement: true,
    });
  });

  it("includes renegotiation and carried balances in the typed invoice total", () => {
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

    const summary = buildImportFinancialSummary({
      rows,
      source: "nubank_credit_card",
    });

    // Reneg wipe dominates even with payment applied → 0.
    expect(summary).toMatchObject({
      invoiceTotal: 0,
      paymentsTotal: 600,
      paymentCount: 1,
      isCreditCardStatement: true,
    });
    expect(summary?.groups?.carried).toBe(1244.73);
    expect(summary?.groups?.renegotiationInstallments).toBe(835.6);
    expect(summary?.groups?.renegotiationCredits).toBe(3001.06);
  });
});
