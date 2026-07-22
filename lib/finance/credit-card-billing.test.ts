import { describe, expect, it } from "vitest";

import {
  buildStatementCycle,
  classifyStatementCycle,
  deriveStatementStatus,
  formatStatementPeriodLabel,
  getClosingDateForTransactionDate,
  getCreditCardBillingValidationError,
  getCreditCardBillingConfig,
  getCurrentStatementCycle,
  getDueDateForClosingDate,
  getStatementCycleForDate,
  getStatementCyclePaidByPaymentDate,
  getStatementSettlement,
  getTransactionStatementRelation,
  hasCreditCardBillingConfig,
  isPaymentAttributedToStatementCycle,
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

    expect(hasCreditCardBillingConfig(null)).toBe(false);
    expect(hasCreditCardBillingConfig(undefined)).toBe(false);
    expect(getCreditCardBillingConfig(null)).toBeNull();
    expect(getCreditCardBillingConfig(undefined)).toBeNull();

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

  it("returns billing config for a valid credit card account", () => {
    expect(
      getCreditCardBillingConfig({
        type: "credit_card",
        statement_closing_day: 25,
        statement_due_day: 3,
      }),
    ).toEqual({
      statementClosingDay: 25,
      statementDueDay: 3,
    });
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

  it("attributes payments by statementDueDate before legacy statementCycleId", () => {
    const cycle = {
      ...julyCycle,
      source: "imported" as const,
      dueDate: "2026-05-04",
    };

    expect(
      isPaymentAttributedToStatementCycle({
        accountId: "card-1",
        cycle,
        config,
        transaction: {
          accountId: "card-1",
          date: "2026-05-01",
          type: "income",
          amount: 3844.33,
          statementDueDate: "2026-05-04",
          // Intentionally wrong/legacy closing — due must win.
          statementCycleId: "2026-04-24",
        },
      }),
    ).toBe(true);

    expect(
      isPaymentAttributedToStatementCycle({
        accountId: "card-1",
        cycle,
        config,
        transaction: {
          accountId: "card-1",
          date: "2026-05-01",
          type: "income",
          amount: 100,
          statementDueDate: "2026-06-04",
          statementCycleId: cycle.cycleId,
        },
      }),
    ).toBe(false);
  });

  it("keeps legacy closing attribution when statementDueDate is absent", () => {
    expect(
      isPaymentAttributedToStatementCycle({
        accountId: "card-1",
        cycle: julyCycle,
        config,
        transaction: {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 50,
          statementCycleId: julyCycle.cycleId,
        },
      }),
    ).toBe(true);
  });

  it("settles imported invoice status from due-linked payment", () => {
    const cycle = {
      ...julyCycle,
      source: "imported" as const,
      dueDate: "2026-05-04",
      issuerAmountDue: 3844.33,
    };

    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle,
      referenceDate: "2026-05-10",
      transactions: [
        {
          accountId: "card-1",
          date: "2026-04-10",
          type: "expense",
          amount: 800,
        },
        {
          accountId: "card-1",
          date: "2026-05-01",
          type: "income",
          amount: 3844.33,
          statementDueDate: "2026-05-04",
          statementCycleId: null,
          invoicePaymentOrigin: "imported",
        },
      ],
    });

    expect(settlement.amountDueTotal).toBe(3844.33);
    expect(settlement.paidTotal).toBe(3844.33);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
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

  it("does not count unlinked estorno/credit incomes as invoice payments", () => {
    const mayCycle = {
      cycleId: "2026-05-25",
      periodStart: "2026-04-26",
      periodEnd: "2026-05-25",
      closingDate: "2026-05-25",
      dueDate: "2026-06-01",
      source: "imported" as const,
      issuerAmountDue: 4654.46,
    };

    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: mayCycle,
      referenceDate: "2026-06-10",
      transactions: [
        {
          accountId: "card-1",
          date: "2026-05-25",
          type: "income",
          amount: 4654.46,
          statementDueDate: "2026-06-01",
          statementCycleId: "2026-05-25",
          invoicePaymentOrigin: "imported",
          description: "Pagamento recebido",
        },
        {
          accountId: "card-1",
          date: "2026-06-22",
          type: "income",
          amount: 49.97,
          description: 'Estorno de "Ifd*Ocaneco Bar Ltda." (iFood)',
        },
      ],
      includeRolledInPurchases: false,
    });

    // Estorno on 06-22 would previously infer into closing 05-25 via date.
    expect(settlement.paidTotal).toBe(4654.46);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("uses stored issuer amount_due for imported bills over purchase-window sum", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: {
        ...julyCycle,
        source: "imported",
        issuerAmountDue: 4654.46,
      },
      transactions: [
        {
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 3790.98,
        },
      ],
      referenceDate: "2026-08-10",
      includeRolledInPurchases: true,
    });

    expect(settlement.amountDueTotal).toBe(4654.46);
    expect(settlement.cyclePurchasesTotal).toBe(3790.98);
    expect(settlement.issuerPurchaseGap).toBe(863.48);
    expect(settlement.remainingTotal).toBe(4654.46);
    expect(settlement.status).toBe("overdue");
  });

  it("uses issuer amount_due for imported bills even when purchases are a partial window", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: {
        ...julyCycle,
        source: "imported",
        issuerAmountDue: 3844.33,
      },
      transactions: [
        {
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 820.48,
        },
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 3844.33,
          statementCycleId: "2026-07-20",
          invoicePaymentOrigin: "imported",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.amountDueTotal).toBe(3844.33);
    expect(settlement.paidTotal).toBe(3844.33);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("uses linked payment as A pagar for imported bills when amount_due was cleared", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: {
        ...julyCycle,
        source: "imported",
        issuerAmountDue: null,
      },
      transactions: [
        {
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 863.46,
        },
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 3844.33,
          statementCycleId: "2026-07-20",
          invoicePaymentOrigin: "imported",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.amountDueTotal).toBe(3844.33);
    expect(settlement.paidTotal).toBe(3844.33);
    expect(settlement.remainingTotal).toBe(0);
  });

  it("keeps derived cycles on purchase totals even if a stray issuer amount_due is present", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: {
        ...julyCycle,
        source: "derived",
        issuerAmountDue: 3844.33,
      },
      transactions: [
        {
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 820.48,
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.amountDueTotal).toBe(820.48);
  });

  it("falls back to issuer amount_due when the purchase window is empty", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: {
        ...julyCycle,
        source: "imported",
        issuerAmountDue: 1500,
      },
      transactions: [
        {
          accountId: "card-1",
          date: "2026-07-26",
          type: "income",
          amount: 1500,
          statementCycleId: "2026-07-20",
          invoicePaymentOrigin: "imported",
        },
      ],
      referenceDate: "2026-07-26",
    });

    expect(settlement.amountDueTotal).toBe(1500);
    expect(settlement.paidTotal).toBe(1500);
    expect(settlement.status).toBe("paid");
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
