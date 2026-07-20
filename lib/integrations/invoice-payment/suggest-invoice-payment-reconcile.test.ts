import { describe, expect, it } from "vitest";

import {
  getStatementSettlement,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import {
  amountsMatchForInvoiceReconcile,
  getInvoicePaymentDateDiffDays,
  suggestInvoicePaymentReconcile,
  suggestInvoicePaymentReconcileForRows,
  type ManualInvoicePaymentCandidate,
} from "@/lib/integrations/invoice-payment/suggest-invoice-payment-reconcile";

const CARD_ID = "card-1";
const CHECKING_ID = "checking-1";
const OTHER_CHECKING = "checking-2";

const CONFIG: CreditCardBillingConfig = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

const CYCLE_ID = "2026-07-25";

function manualCandidate(
  overrides: Partial<ManualInvoicePaymentCandidate> = {},
): ManualInvoicePaymentCandidate {
  return {
    cardTransactionId: "manual-card-1",
    sourceTransactionId: "manual-source-1",
    sourceAccountId: CHECKING_ID,
    cardAccountId: CARD_ID,
    amount: 500,
    paymentDate: "2026-08-01",
    statementCycleId: CYCLE_ID,
    reconciledWithTransactionId: null,
    ...overrides,
  };
}

describe("suggestInvoicePaymentReconcile", () => {
  it("suggests when card, cycle, source, amount and date match", () => {
    const suggestion = suggestInvoicePaymentReconcile({
      imported: {
        amount: 500,
        paymentDate: "2026-08-01",
        cycleId: CYCLE_ID,
        cardAccountId: CARD_ID,
        sourceAccountId: CHECKING_ID,
      },
      candidates: [manualCandidate()],
    });

    expect(suggestion).toMatchObject({
      manualCardTransactionId: "manual-card-1",
      manualSourceTransactionId: "manual-source-1",
      confidence: "high",
      statementCycleId: CYCLE_ID,
    });
  });

  it("suggests partial manual amount when imported amount matches that partial", () => {
    const suggestion = suggestInvoicePaymentReconcile({
      imported: {
        amount: 200,
        paymentDate: "2026-08-02",
        cycleId: CYCLE_ID,
        cardAccountId: CARD_ID,
        sourceAccountId: CHECKING_ID,
      },
      candidates: [manualCandidate({ amount: 200, paymentDate: "2026-08-01" })],
    });

    expect(suggestion?.manualCardTransactionId).toBe("manual-card-1");
    expect(suggestion?.confidence).toBe("high");
  });

  it("does not suggest without source account selected", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 500,
          paymentDate: "2026-08-01",
          cycleId: CYCLE_ID,
          cardAccountId: CARD_ID,
          sourceAccountId: null,
        },
        candidates: [manualCandidate()],
      }),
    ).toBeNull();
  });

  it("does not suggest when source accounts differ", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 500,
          paymentDate: "2026-08-01",
          cycleId: CYCLE_ID,
          cardAccountId: CARD_ID,
          sourceAccountId: OTHER_CHECKING,
        },
        candidates: [manualCandidate()],
      }),
    ).toBeNull();
  });

  it("does not suggest when cycles differ", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 500,
          paymentDate: "2026-08-01",
          cycleId: "2026-06-25",
          cardAccountId: CARD_ID,
          sourceAccountId: CHECKING_ID,
        },
        candidates: [manualCandidate()],
      }),
    ).toBeNull();
  });

  it("does not suggest when amounts differ", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 499,
          paymentDate: "2026-08-01",
          cycleId: CYCLE_ID,
          cardAccountId: CARD_ID,
          sourceAccountId: CHECKING_ID,
        },
        candidates: [manualCandidate()],
      }),
    ).toBeNull();
  });

  it("does not suggest when date gap is too large", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 500,
          paymentDate: "2026-08-10",
          cycleId: CYCLE_ID,
          cardAccountId: CARD_ID,
          sourceAccountId: CHECKING_ID,
        },
        candidates: [manualCandidate({ paymentDate: "2026-08-01" })],
      }),
    ).toBeNull();
  });

  it("does not suggest already reconciled manuals", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 500,
          paymentDate: "2026-08-01",
          cycleId: CYCLE_ID,
          cardAccountId: CARD_ID,
          sourceAccountId: CHECKING_ID,
        },
        candidates: [
          manualCandidate({ reconciledWithTransactionId: "imported-old" }),
        ],
      }),
    ).toBeNull();
  });

  it("returns null when multiple manuals qualify (ambiguous)", () => {
    expect(
      suggestInvoicePaymentReconcile({
        imported: {
          amount: 500,
          paymentDate: "2026-08-01",
          cycleId: CYCLE_ID,
          cardAccountId: CARD_ID,
          sourceAccountId: CHECKING_ID,
        },
        candidates: [
          manualCandidate({ cardTransactionId: "m1" }),
          manualCandidate({
            cardTransactionId: "m2",
            sourceTransactionId: "s2",
          }),
        ],
      }),
    ).toBeNull();
  });

  it("reserves a manual across multiple import rows", () => {
    const suggestions = suggestInvoicePaymentReconcileForRows({
      rows: [
        {
          sourceLine: 1,
          imported: {
            amount: 500,
            paymentDate: "2026-08-01",
            cycleId: CYCLE_ID,
            cardAccountId: CARD_ID,
            sourceAccountId: CHECKING_ID,
          },
        },
        {
          sourceLine: 2,
          imported: {
            amount: 500,
            paymentDate: "2026-08-01",
            cycleId: CYCLE_ID,
            cardAccountId: CARD_ID,
            sourceAccountId: CHECKING_ID,
          },
        },
      ],
      candidates: [manualCandidate()],
    });

    expect(Object.keys(suggestions)).toEqual(["1"]);
    expect(suggestions[1]?.manualCardTransactionId).toBe("manual-card-1");
  });
});

describe("invoice payment reconcile settlement", () => {
  it("does not double-count paid total after manual↔imported link", () => {
    const cycle = {
      cycleId: CYCLE_ID,
      periodStart: "2026-06-26",
      periodEnd: CYCLE_ID,
      closingDate: CYCLE_ID,
      dueDate: "2026-08-01",
    };

    const settlement = getStatementSettlement({
      accountId: CARD_ID,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-02",
      transactions: [
        {
          accountId: CARD_ID,
          type: "expense",
          amount: 500,
          date: "2026-07-10",
        },
        {
          accountId: CARD_ID,
          type: "income",
          amount: 500,
          date: "2026-08-01",
          statementCycleId: CYCLE_ID,
          invoicePaymentOrigin: "manual",
          reconciledWithTransactionId: "imported-card-1",
        },
        {
          accountId: CARD_ID,
          type: "income",
          amount: 500,
          date: "2026-08-01",
          statementCycleId: CYCLE_ID,
          invoicePaymentOrigin: "imported",
          reconciledWithTransactionId: "manual-card-1",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(500);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
    expect(settlement.paymentCount).toBe(1);
  });

  it("still counts a lone imported payment with no manual", () => {
    const cycle = {
      cycleId: CYCLE_ID,
      periodStart: "2026-06-26",
      periodEnd: CYCLE_ID,
      closingDate: CYCLE_ID,
      dueDate: "2026-08-01",
    };

    const settlement = getStatementSettlement({
      accountId: CARD_ID,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-02",
      transactions: [
        {
          accountId: CARD_ID,
          type: "expense",
          amount: 300,
          date: "2026-07-10",
        },
        {
          accountId: CARD_ID,
          type: "income",
          amount: 300,
          date: "2026-08-01",
          statementCycleId: CYCLE_ID,
          invoicePaymentOrigin: "imported",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(300);
    expect(settlement.status).toBe("paid");
  });
});

describe("reconcile helpers", () => {
  it("matches amounts within epsilon and measures date gaps", () => {
    expect(amountsMatchForInvoiceReconcile(100, 100.004)).toBe(true);
    expect(amountsMatchForInvoiceReconcile(100, 100.02)).toBe(false);
    expect(getInvoicePaymentDateDiffDays("2026-08-01", "2026-08-04")).toBe(3);
  });
});
