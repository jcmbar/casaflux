import { describe, expect, it } from "vitest";

import { getInvoicePaymentCycleTargetEstimatedEffect } from "./invoice-payment-cycle-estimate";
import {
  buildInvoicePaymentCycleTargetOptions,
  buildInvoicePaymentFutureCycleOptions,
  getInvoicePaymentCycleTargetImpactMessage,
} from "./invoice-payment-cycle-target";
import {
  classifyImportedInvoicePaymentSuggestionConfidence,
  getInvoicePaymentSuggestionConfidenceMessage,
} from "./invoice-payment-suggestion-confidence";

const billingConfig = {
  statementClosingDay: 25,
  statementDueDay: 3,
};

const CARD_ACCOUNT_ID = "card-account-1";

describe("classifyImportedInvoicePaymentSuggestionConfidence", () => {
  it("returns high confidence for a typical previous-cycle payment", () => {
    const result = classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: "2026-06-26",
      creditAmount: 3598.45,
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-10",
          type: "expense",
          amount: 3598.45,
        },
      ],
    });

    expect(result).toMatchObject({
      confidence: "high",
      message: getInvoicePaymentSuggestionConfidenceMessage("high"),
    });
  });

  it("returns medium confidence when timing is plausible but amount does not match", () => {
    const result = classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: "2026-06-25",
      creditAmount: 500,
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-10",
          type: "expense",
          amount: 1000,
        },
      ],
    });

    expect(result?.confidence).toBe("medium");
    expect(result?.message).toMatch(/confiança média/i);
  });

  it("returns low confidence when the suggested cycle is already paid", () => {
    const result = classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: "2026-06-26",
      creditAmount: 1000,
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-10",
          type: "expense",
          amount: 1000,
        },
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-20",
          type: "income",
          amount: 1000,
          statementCycleId: "2026-06-25",
        },
      ],
    });

    expect(result?.confidence).toBe("low");
    expect(result?.message).toMatch(/baixa confiança/i);
  });

  it("returns low confidence when there is no amount due on the suggested cycle", () => {
    const result = classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate: "2026-06-26",
      creditAmount: 500,
      transactions: [],
    });

    expect(result?.confidence).toBe("low");
  });
});

describe("suggestion confidence + existing card helpers (no regression)", () => {
  const paymentDate = "2026-06-26";
  const options = buildInvoicePaymentCycleTargetOptions(
    billingConfig,
    paymentDate,
  );
  const futureOptions = buildInvoicePaymentFutureCycleOptions(
    billingConfig,
    paymentDate,
  );
  const transactions = [
    {
      accountId: CARD_ACCOUNT_ID,
      date: "2026-06-10",
      type: "expense" as const,
      amount: 1000,
    },
  ];

  it("keeps impact and estimate unchanged when confidence is computed", () => {
    const confidence = classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate,
      creditAmount: 1000,
      transactions,
    });

    const impact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: options,
      cycleTargetSelection: { target: "previous" },
      futureCycleOptions: futureOptions,
    });

    const estimate = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate,
      creditAmount: 1000,
      cycleTargetSelection: { target: "previous" },
      transactions,
    });

    expect(confidence?.confidence).toBe("high");
    expect(impact?.text).toContain("26/05–25/06");
    expect(estimate?.text).toContain("quitada");
  });
});
