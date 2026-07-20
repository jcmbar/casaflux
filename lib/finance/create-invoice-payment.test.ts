import { describe, expect, it } from "vitest";

import {
  deriveStatementStatus,
  getStatementSettlement,
  shouldCountPaymentTowardSettlement,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import {
  getInvoicePaymentValidationError,
  resolveInvoicePaymentTarget,
} from "@/lib/finance/create-invoice-payment";

const CARD = {
  id: "card-1",
  type: "credit_card" as const,
  statement_closing_day: 25,
  statement_due_day: 1,
};

const CONFIG: CreditCardBillingConfig = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

describe("manual invoice payment", () => {
  it("requires a source account different from the card", () => {
    expect(
      getInvoicePaymentValidationError({
        amount: 100,
        sourceAccountId: "",
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/conta de origem/i);

    expect(
      getInvoicePaymentValidationError({
        amount: 100,
        sourceAccountId: CARD.id,
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/diferente do cartão/i);
  });

  it("requires a positive amount and a valid payment date", () => {
    expect(
      getInvoicePaymentValidationError({
        amount: 0,
        sourceAccountId: "checking-1",
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/valor válido/i);

    expect(
      getInvoicePaymentValidationError({
        amount: 50,
        sourceAccountId: "checking-1",
        cardAccountId: CARD.id,
        paymentDate: "01/08/2026",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/data/i);
  });

  it("links to the UI fatura cycle even when payment date would pick another cycle", () => {
    const target = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      // Before closing → date-based would pick previous cycle (2026-06-25).
      paymentDate: "2026-07-10",
      statementCycleId: "2026-07-25",
    });

    expect(target?.statementCycleId).toBe("2026-07-25");
    expect(target?.cycle.periodStart).toBe("2026-06-26");
    expect(target?.cycle.periodEnd).toBe("2026-07-25");
    expect(target?.cycle.dueDate).toBe("2026-08-01");
  });

  it("falls back to payment-date cycle when UI cycle is omitted", () => {
    const target = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-07-26",
    });

    expect(target?.statementCycleId).toBe("2026-07-25");
  });

  it("updates settlement to paid after a full manual payment", () => {
    const cycle = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-08-01",
      statementCycleId: "2026-07-25",
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD.id,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-01",
      transactions: [
        {
          accountId: CARD.id,
          type: "expense",
          amount: 200,
          date: "2026-07-10",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 200,
          date: "2026-08-01",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "manual",
        },
      ],
    });

    expect(settlement.amountDueTotal).toBe(200);
    expect(settlement.paidTotal).toBe(200);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("updates settlement to partial after a partial manual payment", () => {
    const cycle = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-08-01",
      statementCycleId: "2026-07-25",
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD.id,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-01",
      transactions: [
        {
          accountId: CARD.id,
          type: "expense",
          amount: 200,
          date: "2026-07-10",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 80,
          date: "2026-08-01",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "manual",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(80);
    expect(settlement.remainingTotal).toBe(120);
    expect(settlement.status).toBe("partial");
    expect(
      deriveStatementStatus({
        purchasesTotal: settlement.amountDueTotal,
        paidTotal: settlement.paidTotal,
        dueDate: cycle.dueDate,
        referenceDate: "2026-08-01",
      }),
    ).toBe("partial");
  });

  it("does not double-count a reconciled manual twin of an imported payment", () => {
    expect(
      shouldCountPaymentTowardSettlement({
        invoicePaymentOrigin: "manual",
        reconciledWithTransactionId: "imported-leg",
      }),
    ).toBe(false);

    expect(
      shouldCountPaymentTowardSettlement({
        invoicePaymentOrigin: "imported",
        reconciledWithTransactionId: "manual-leg",
      }),
    ).toBe(true);

    expect(
      shouldCountPaymentTowardSettlement({
        invoicePaymentOrigin: "manual",
        reconciledWithTransactionId: null,
      }),
    ).toBe(true);

    const cycle = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-08-01",
      statementCycleId: "2026-07-25",
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD.id,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-01",
      transactions: [
        {
          accountId: CARD.id,
          type: "expense",
          amount: 100,
          date: "2026-07-10",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 100,
          date: "2026-07-28",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "manual",
          reconciledWithTransactionId: "imported-1",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 100,
          date: "2026-07-28",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "imported",
          reconciledWithTransactionId: "manual-1",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(100);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
    expect(settlement.paymentCount).toBe(1);
  });
});
