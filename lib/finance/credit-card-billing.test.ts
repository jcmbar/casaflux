import { describe, expect, it } from "vitest";

import {
  buildStatementCycle,
  classifyStatementCycle,
  deriveStatementStatus,
  formatStatementPeriodLabel,
  getClosingDateForTransactionDate,
  getCreditCardBillingValidationError,
  getCurrentStatementCycle,
  getDueDateForClosingDate,
  getStatementCycleForDate,
  getStatementCyclePaidByPaymentDate,
  getStatementSettlement,
  getTransactionStatementRelation,
  hasCreditCardBillingConfig,
  STATEMENT_STATUS_LABELS,
  summarizeStatementCycleTransactions,
} from "./credit-card-billing";

const config = {
  statementClosingDay: 20,
  statementDueDay: 27,
};

describe("credit card statement cycle", () => {
  it("builds a cross-month period from closing/due days", () => {
    const cycle = buildStatementCycle({
      closingDate: "2026-07-20",
      closingDay: 20,
      dueDay: 27,
    });

    expect(cycle).toEqual({
      cycleId: "2026-07-20",
      periodStart: "2026-06-21",
      periodEnd: "2026-07-20",
      closingDate: "2026-07-20",
      dueDate: "2026-07-27",
    });
    expect(formatStatementPeriodLabel(cycle)).toBe("21/06–20/07");
  });

  it("places due date in the next month when due day is before closing day", () => {
    expect(getDueDateForClosingDate("2026-07-28", 5)).toBe("2026-08-05");
  });

  it("clamps closing day to month length", () => {
    expect(getClosingDateForTransactionDate("2026-02-10", 31)).toBe(
      "2026-02-28",
    );
  });

  it("assigns purchases to the cycle that contains their date", () => {
    expect(getClosingDateForTransactionDate("2026-07-15", 20)).toBe(
      "2026-07-20",
    );
    expect(getClosingDateForTransactionDate("2026-07-20", 20)).toBe(
      "2026-07-20",
    );
    expect(getClosingDateForTransactionDate("2026-07-21", 20)).toBe(
      "2026-08-20",
    );

    const current = getCurrentStatementCycle(config, "2026-07-15");
    expect(current.periodStart).toBe("2026-06-21");
    expect(current.periodEnd).toBe("2026-07-20");

    const nextPurchase = getStatementCycleForDate(config, "2026-07-25");
    expect(
      classifyStatementCycle({
        cycle: nextPurchase,
        currentCycle: current,
        closingDay: 20,
      }),
    ).toBe("next");

    const previousPurchase = getStatementCycleForDate(config, "2026-06-10");
    expect(
      classifyStatementCycle({
        cycle: previousPurchase,
        currentCycle: current,
        closingDay: 20,
      }),
    ).toBe("previous");
  });

  it("totals the current statement from card transactions", () => {
    const cycle = getCurrentStatementCycle(config, "2026-07-15");
    const totals = summarizeStatementCycleTransactions(
      [
        {
          accountId: "card-1",
          date: "2026-06-25",
          type: "expense",
          amount: 100,
        },
        {
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 50.5,
        },
        {
          accountId: "card-1",
          date: "2026-07-18",
          type: "income",
          amount: 40,
        },
        {
          accountId: "card-1",
          date: "2026-07-21",
          type: "expense",
          amount: 999,
        },
        {
          accountId: "other",
          date: "2026-07-10",
          type: "expense",
          amount: 10,
        },
      ],
      { accountId: "card-1", cycle },
    );

    expect(totals.purchasesTotal).toBe(150.5);
    expect(totals.paymentsTotal).toBe(40);
    expect(totals.statementTotal).toBe(110.5);
    expect(totals.transactionCount).toBe(3);
  });

  it("ignores non-credit-card accounts", () => {
    expect(
      hasCreditCardBillingConfig({
        type: "checking",
        statement_closing_day: 10,
        statement_due_day: 17,
      }),
    ).toBe(false);

    expect(
      getTransactionStatementRelation({
        account: {
          id: "c1",
          type: "checking",
          statement_closing_day: 10,
          statement_due_day: 17,
        },
        transactionDate: "2026-07-10",
        referenceDate: "2026-07-15",
      }),
    ).toBeNull();
  });

  it("validates closing/due fields for credit cards", () => {
    expect(
      getCreditCardBillingValidationError({
        type: "checking",
        statementClosingDay: null,
        statementDueDay: null,
      }),
    ).toBeNull();

    expect(
      getCreditCardBillingValidationError({
        type: "credit_card",
        statementClosingDay: 20,
        statementDueDay: null,
      }),
    ).toMatch(/fechamento e o dia de vencimento/i);

    expect(
      getCreditCardBillingValidationError({
        type: "credit_card",
        statementClosingDay: 0,
        statementDueDay: 27,
      }),
    ).toMatch(/1 e 31/i);

    expect(
      getCreditCardBillingValidationError({
        type: "credit_card",
        statementClosingDay: 20,
        statementDueDay: 27,
      }),
    ).toBeNull();
  });
});

describe("statement payment cycle + settlement status", () => {
  const julyCycle = buildStatementCycle({
    closingDate: "2026-07-20",
    closingDay: 20,
    dueDay: 27,
  });

  const purchases = [
    {
      accountId: "card-1",
      date: "2026-07-10",
      type: "expense" as const,
      amount: 200,
      description: "Loja",
      statementCycleId: null,
    },
  ];

  it("resolves the paid cycle from payment date (latest closed on/before date)", () => {
    expect(getStatementCyclePaidByPaymentDate(config, "2026-07-26").cycleId).toBe(
      "2026-07-20",
    );
    expect(getStatementCyclePaidByPaymentDate(config, "2026-07-20").cycleId).toBe(
      "2026-07-20",
    );
    expect(getStatementCyclePaidByPaymentDate(config, "2026-07-15").cycleId).toBe(
      "2026-06-20",
    );
  });

  it("status open: before due, unpaid", () => {
    expect(
      deriveStatementStatus({
        purchasesTotal: 200,
        paidTotal: 0,
        dueDate: "2026-07-27",
        referenceDate: "2026-07-25",
      }),
    ).toBe("open");

    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: purchases,
      referenceDate: "2026-07-25",
    });

    expect(settlement.status).toBe("open");
    expect(settlement.remainingTotal).toBe(200);
    expect(STATEMENT_STATUS_LABELS[settlement.status]).toBe("Aberta");
  });

  it("status partial: payment leaves remaining balance", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: [
        ...purchases,
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 80,
          description: "Pagamento recebido",
          statementCycleId: "2026-07-20",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.status).toBe("partial");
    expect(settlement.paidTotal).toBe(80);
    expect(settlement.remainingTotal).toBe(120);
    expect(STATEMENT_STATUS_LABELS[settlement.status]).toBe("Parcial");
  });

  it("status paid: remaining is zero", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: [
        ...purchases,
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 200,
          description: "Pagamento recebido",
          statementCycleId: "2026-07-20",
        },
      ],
      referenceDate: "2026-07-28",
    });

    expect(settlement.status).toBe("paid");
    expect(settlement.remainingTotal).toBe(0);
    expect(STATEMENT_STATUS_LABELS[settlement.status]).toBe("Paga");
  });

  it("status overdue: past due and unpaid", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: purchases,
      referenceDate: "2026-07-28",
    });

    expect(settlement.status).toBe("overdue");
    expect(settlement.remainingTotal).toBe(200);
    expect(STATEMENT_STATUS_LABELS[settlement.status]).toBe("Atrasada");
  });

  it("links payment to the correct cycle and keeps remaining after payment", () => {
    const paymentCycle = getStatementCyclePaidByPaymentDate(
      config,
      "2026-07-26",
    );
    expect(paymentCycle.cycleId).toBe("2026-07-20");

    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: paymentCycle,
      transactions: [
        ...purchases,
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 50,
          description: "Pagamento recebido",
          statementCycleId: paymentCycle.cycleId,
        },
        {
          accountId: "card-1",
          date: "2026-08-05",
          type: "income",
          amount: 999,
          description: "Pagamento recebido",
          statementCycleId: "2026-08-20",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.paidTotal).toBe(50);
    expect(settlement.remainingTotal).toBe(150);
    expect(settlement.status).toBe("partial");
  });

  it("attributes legacy payments without statementCycleId by payment date", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: [
        ...purchases,
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 200,
          description: "Pagamento recebido",
          statementCycleId: null,
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.paidTotal).toBe(200);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("does not break when mixing linked and legacy payments", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: [
        ...purchases,
        {
          accountId: "card-1",
          date: "2026-07-22",
          type: "income",
          amount: 50,
          description: "Pagamento recebido",
          statementCycleId: null,
        },
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 50,
          description: "Pagamento recebido",
          statementCycleId: "2026-07-20",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.paidTotal).toBe(100);
    expect(settlement.remainingTotal).toBe(100);
    expect(settlement.status).toBe("partial");
  });

  it("builds UI snapshot fields: total, paid, remaining, status label", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      transactions: [
        ...purchases,
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 75.5,
          description: "Pagamento recebido",
          statementCycleId: "2026-07-20",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect({
      total: settlement.purchasesTotal,
      paid: settlement.paidTotal,
      remaining: settlement.remainingTotal,
      status: settlement.status,
      statusLabel: STATEMENT_STATUS_LABELS[settlement.status],
    }).toEqual({
      total: 200,
      paid: 75.5,
      remaining: 124.5,
      status: "partial",
      statusLabel: "Parcial",
    });
  });

  it("sums June and July purchases for a 26/06–25/07 cycle", () => {
    const closing25 = {
      statementClosingDay: 25,
      statementDueDay: 1,
    };
    const cycle = getStatementCycleForDate(closing25, "2026-07-20");

    expect(cycle.periodStart).toBe("2026-06-26");
    expect(cycle.periodEnd).toBe("2026-07-25");

    const settlement = getStatementSettlement({
      accountId: "card-1",
      config: closing25,
      cycle,
      referenceDate: "2026-07-20",
      transactions: [
        {
          accountId: "card-1",
          date: "2026-06-26",
          type: "expense",
          amount: 1968.42,
          description: "Junho",
        },
        {
          accountId: "card-1",
          date: "2026-07-15",
          type: "expense",
          amount: 2183.92,
          description: "Julho",
        },
      ],
    });

    expect(settlement.purchasesTotal).toBe(4152.34);
  });
});
