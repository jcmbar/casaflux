import { describe, expect, it } from "vitest";

import {
  buildInvoicePaymentCycleTargetOptions,
  buildInvoicePaymentFutureCycleOptions,
  getInvoicePaymentCycleTargetImpactMessage,
  resolveInvoicePaymentCycleTarget,
} from "./invoice-payment-cycle-target";
import {
  getInvoicePaymentCycleTargetEstimatedEffect,
  mergeSettlementTransactionsForEstimate,
} from "./invoice-payment-cycle-estimate";

const billingConfig = {
  statementClosingDay: 25,
  statementDueDay: 3,
};

const CARD_ACCOUNT_ID = "card-account-1";
const PAYMENT_DATE = "2026-06-26";

describe("getInvoicePaymentCycleTargetEstimatedEffect", () => {
  const previousPurchases = [
    {
      accountId: CARD_ACCOUNT_ID,
      date: "2026-06-10",
      type: "expense" as const,
      amount: 1000,
      description: "Compras fatura anterior",
    },
  ];

  const openCyclePurchases = [
    {
      accountId: CARD_ACCOUNT_ID,
      date: "2026-07-05",
      type: "expense" as const,
      amount: 800,
      description: "Compras fatura em aberto",
    },
  ];

  it("estimates paying off the previous statement", () => {
    const effect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 1000,
      cycleTargetSelection: { target: "previous" },
      transactions: previousPurchases,
    });

    expect(effect).toMatchObject({
      target: "previous",
      remainingAfterCredit: 0,
      text: "Esta fatura ficará quitada com este crédito.",
    });
  });

  it("estimates partial remaining on the previous statement", () => {
    const effect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 400,
      cycleTargetSelection: { target: "previous" },
      transactions: previousPurchases,
    });

    expect(effect).toMatchObject({
      target: "previous",
      remainingAfterCredit: 600,
    });
    expect(effect?.text).toMatch(/Saldo restante após este crédito: R\$\s*600,00/);
  });

  it("estimates anticipation on the open statement", () => {
    const effect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 800,
      cycleTargetSelection: { target: "current" },
      transactions: openCyclePurchases,
    });

    expect(effect).toMatchObject({
      target: "current",
      remainingAfterCredit: 0,
      text: "A fatura em aberto ficará quitada com este crédito.",
    });
  });

  it("estimates partial remaining on the open statement", () => {
    const effect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 300,
      cycleTargetSelection: { target: "current" },
      transactions: openCyclePurchases,
    });

    expect(effect).toMatchObject({
      target: "current",
      remainingAfterCredit: 500,
    });
    expect(effect?.text).toMatch(
      /Saldo restante da fatura em aberto após este crédito: R\$\s*500,00/,
    );
  });

  it("estimates credit on a selected future statement", () => {
    const futureOptions = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      PAYMENT_DATE,
    );
    const futureCycle = resolveInvoicePaymentCycleTarget(
      billingConfig,
      PAYMENT_DATE,
      { target: "future", futureCycleId: futureOptions[0]!.cycleId },
    );

    const effect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 250,
      cycleTargetSelection: {
        target: "future",
        futureCycleId: futureOptions[0]!.cycleId,
      },
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: futureCycle.periodStart,
          type: "expense",
          amount: 250,
        },
      ],
    });

    expect(effect).toMatchObject({
      target: "future",
      remainingAfterCredit: 0,
      text: "A fatura futura escolhida ficará quitada com este crédito.",
    });
  });

  it("updates the estimate when the target option changes", () => {
    const transactions = mergeSettlementTransactionsForEstimate(
      previousPurchases,
      openCyclePurchases,
    );

    const previousEffect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 500,
      cycleTargetSelection: { target: "previous" },
      transactions,
    });

    const currentEffect = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 500,
      cycleTargetSelection: { target: "current" },
      transactions,
    });

    expect(previousEffect?.remainingAfterCredit).toBe(500);
    expect(currentEffect?.remainingAfterCredit).toBe(300);
    expect(previousEffect?.text).not.toBe(currentEffect?.text);
  });
});

describe("impact + estimate integration (no regression)", () => {
  it("keeps impact messages independent from settlement estimate", () => {
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      PAYMENT_DATE,
    );
    const futureOptions = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      PAYMENT_DATE,
    );

    const impact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: options,
      cycleTargetSelection: { target: "current" },
      futureCycleOptions: futureOptions,
    });

    const estimate = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: PAYMENT_DATE,
      creditAmount: 100,
      cycleTargetSelection: { target: "current" },
      transactions: [],
    });

    expect(impact?.text).toMatch(/antecipa/);
    expect(estimate?.text).toBeTruthy();
    expect(impact?.text).not.toBe(estimate?.text);
  });
});
