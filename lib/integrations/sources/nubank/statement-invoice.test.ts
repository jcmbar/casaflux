import { describe, expect, it } from "vitest";

import { classifyNubankStatementLine } from "./statement-line-kind";
import {
  buildNubankStatementInvoiceBreakdown,
  getNubankStatementClosingDateFromRows,
} from "./statement-invoice";
import { buildImportedCardStatementCycleUpserts } from "@/lib/integrations/invoice-payment/capture-imported-statement-cycle";
import type { ImportPreviewRow } from "@/lib/integrations/types";

describe("classifyNubankStatementLine", () => {
  it("classifies the Nubank title matrix", () => {
    expect(
      classifyNubankStatementLine({
        title: "Pagamento recebido",
        amount: -100,
      }),
    ).toBe("PAYMENT");
    expect(
      classifyNubankStatementLine({
        title: "Mercado Livre",
        amount: 50,
      }),
    ).toBe("PURCHASE");
    expect(
      classifyNubankStatementLine({
        title: "Netflix Parcela 1/12",
        amount: 40,
      }),
    ).toBe("INSTALLMENT");
    expect(
      classifyNubankStatementLine({
        title: "Juros de rotativo",
        amount: 12,
      }),
    ).toBe("INTEREST");
    expect(
      classifyNubankStatementLine({
        title: "IOF de compra internacional",
        amount: 3,
      }),
    ).toBe("IOF");
    expect(
      classifyNubankStatementLine({
        title: "Multa de atraso",
        amount: 5,
      }),
    ).toBe("LATE_FEE");
    expect(
      classifyNubankStatementLine({
        title: "Saldo em atraso",
        amount: 100,
      }),
    ).toBe("PREVIOUS_BALANCE");
    expect(
      classifyNubankStatementLine({
        title: "Saldo em rotativo",
        amount: 80,
      }),
    ).toBe("REVOLVING_BALANCE");
    expect(
      classifyNubankStatementLine({
        title: "Valor pendente do mês anterior",
        amount: 200,
      }),
    ).toBe("PENDING_PREVIOUS_MONTH");
    expect(
      classifyNubankStatementLine({
        title: "Renegociação de pendências (02/Abril) - 1/5",
        amount: 835.6,
      }),
    ).toBe("RENEGOTIATION_INSTALLMENT");
    expect(
      classifyNubankStatementLine({
        title: "Renegociação de pendências (02/Abril)",
        amount: -3001.06,
      }),
    ).toBe("RENEGOTIATION_CREDIT");
    expect(
      classifyNubankStatementLine({
        title: "Estorno de juros de rotativo",
        amount: -12,
      }),
    ).toBe("CREDIT");
    expect(
      classifyNubankStatementLine({
        title:
          "Desconto de antecipação de pagamento de pix (Jeniffer)",
        amount: -52,
      }),
    ).toBe("CREDIT");
  });
});

describe("buildNubankStatementInvoiceBreakdown", () => {
  it("excludes prior-due payment from January preliminary total (~1847.30)", () => {
    const breakdown = buildNubankStatementInvoiceBreakdown({
      previousDueDate: "2025-12-25",
      rows: [
        {
          date: "2025-12-20",
          description: "Pagamento recebido",
          amount: -2410.89,
        },
        {
          date: "2026-01-05",
          description: "Loja A",
          amount: 900,
        },
        {
          date: "2026-01-10",
          description: "Loja B Parcela 1/3",
          amount: 500,
        },
        {
          date: "2026-01-15",
          description: "IOF de compra internacional",
          amount: 12.3,
        },
        {
          date: "2026-01-18",
          description: "Estorno de taxa",
          amount: -15,
        },
        {
          date: "2026-01-20",
          description: "App X",
          amount: 450,
        },
      ],
    });

    // 900 + 500 + 450 + 12.30 − 15 = 1847.30; Dec payment excluded.
    expect(breakdown.amountDue).toBe(1847.3);
    expect(breakdown.paymentsForPriorBill).toBe(2410.89);
    expect(breakdown.paymentsAppliedToBill).toBe(0);
    expect(breakdown.closingDate).toBe("2026-01-20");
  });

  it("adds renegotiation installment and subtracts renegotiation credit", () => {
    const breakdown = buildNubankStatementInvoiceBreakdown({
      rows: [
        { date: "2026-04-10", description: "Compra", amount: 100 },
        {
          date: "2026-04-12",
          description: "Renegociação de pendências (02/Abril)",
          amount: -300,
        },
        {
          date: "2026-04-12",
          description: "Renegociação de pendências (02/Abril) - 1/5",
          amount: 80,
        },
      ],
    });

    expect(breakdown.groups.renegotiationInstallments).toBe(80);
    expect(breakdown.groups.renegotiationCredits).toBe(300);
    expect(breakdown.groups.renegotiation).toBe(-220);
    expect(breakdown.amountDue).toBe(0); // max(0, 100+80-300)
  });

  it("does not treat payments as consumption", () => {
    const breakdown = buildNubankStatementInvoiceBreakdown({
      previousDueDate: "2026-03-01",
      rows: [
        { date: "2026-03-10", description: "Mercado", amount: 200 },
        {
          date: "2026-03-15",
          description: "Pagamento recebido",
          amount: -50,
        },
      ],
    });

    expect(breakdown.groups.consumption).toBe(200);
    expect(breakdown.groups.payments).toBe(50);
    expect(breakdown.amountDue).toBe(150);
  });

  it("keeps explicitly tagged prior settlements out of paymentsApplied", () => {
    const breakdown = buildNubankStatementInvoiceBreakdown({
      previousDueDate: "2026-05-01",
      rows: [
        { date: "2026-05-10", description: "Compra", amount: 500 },
        {
          date: "2026-05-24",
          description: "Pagamento recebido",
          amount: -100,
          // After previous due, but tagged to another bill.
          settlePriorBill: true,
        },
      ],
    });

    expect(breakdown.paymentsAppliedToBill).toBe(0);
    expect(breakdown.paymentsForPriorBill).toBe(100);
    expect(breakdown.amountDue).toBe(500);
  });

  it("uses the last row date as closing", () => {
    expect(
      getNubankStatementClosingDateFromRows([
        { date: "2026-01-02", include: true },
        { date: "2026-01-28", include: true },
        { date: "2026-01-15", include: true },
      ]),
    ).toBe("2026-01-28");
  });
});

describe("cross-file prior-cycle enrichment", () => {
  function row(
    partial: Partial<ImportPreviewRow> &
      Pick<ImportPreviewRow, "sourceLine" | "date" | "amount" | "description">,
  ): ImportPreviewRow {
    return {
      source: "nubank_credit_card",
      direction: "out",
      kind: "card_purchase",
      externalFingerprint: `fp-${partial.sourceLine}`,
      externalId: null,
      metadata: {},
      reviewStatus: "ready",
      historicalStatus: "new",
      categoryStatus: "none",
      ...partial,
    };
  }

  it("lifts prior amount_due from Saldo em atraso on the next file", () => {
    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        row({
          sourceLine: 1,
          date: "2026-02-01",
          amount: 1847.34,
          description: "Saldo em atraso",
        }),
        row({
          sourceLine: 2,
          date: "2026-02-10",
          amount: 100,
          description: "Padaria",
        }),
      ],
      billingConfig: {
        statementClosingDay: 25,
        statementDueDay: 1,
      },
      accountId: "card-1",
      ownerUserId: "user-1",
      fileCycle: {
        closingDate: "2026-02-25",
        dueDate: "2026-03-01",
      },
    });

    const prior = upserts.find((item) => item.dueDate === "2026-02-01");
    expect(prior?.amountDue).toBe(1847.34);

    const fileBill = upserts.find((item) => item.closingDate === "2026-02-25");
    expect(fileBill?.amountDue).toBeGreaterThan(0);
  });

  it("lifts prior amount_due from post-closing settlement payment", () => {
    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        {
          ...row({
            sourceLine: 1,
            date: "2026-05-04",
            amount: 1613.81,
            description: "Pagamento recebido",
          }),
          direction: "in",
          kind: "card_invoice_payment",
        },
        row({
          sourceLine: 2,
          date: "2026-05-10",
          amount: 200,
          description: "Farmácia",
        }),
      ],
      billingConfig: {
        statementClosingDay: 25,
        statementDueDay: 1,
      },
      accountId: "card-1",
      ownerUserId: "user-1",
      fileCycle: {
        closingDate: "2026-05-25",
        dueDate: "2026-06-01",
      },
      invoicePaymentModes: { 1: "payment" },
      invoicePaymentCycleTargets: {
        1: { target: "previous", targetDueDate: "2026-05-04" },
      },
    });

    const april = upserts.find((item) => item.dueDate === "2026-05-04");
    expect(april?.amountDue).toBe(1613.81);
  });
});
