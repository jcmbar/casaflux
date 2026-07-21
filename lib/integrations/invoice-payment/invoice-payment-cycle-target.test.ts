import { describe, expect, it } from "vitest";

import { getStatementSettlement } from "@/lib/finance/credit-card-billing";
import { buildImportPreview } from "../core/import-orchestrator";
import {
  buildCommitImportRpcPayload,
  resolveImportBillingConfig,
} from "../commit/commit-import-preview";
import {
  buildCommitImportRowPayload,
  mapImportRowToTransactions,
} from "../commit/map-import-row";
import { hashImportContent } from "../history/hash-content";
import { resolveImportedInvoicePayment } from "./resolve-invoice-payment";
import {
  buildInvoicePaymentCycleTargetOptions,
  buildInvoicePaymentFutureCycleOptions,
  getAnticipatedStatementCycle,
  getDefaultInvoicePaymentCycleTargetSelection,
  getInvoicePaymentCycleTargetImpactMessage,
  applyInvoicePaymentCycleTargetChange,
  isInvoicePaymentCycleTargetChecked,
  parseInvoicePaymentCycleTargetValue,
  resolveImportedInvoicePaymentCycleId,
  resolveInvoicePaymentCycleTarget,
} from "./invoice-payment-cycle-target";
import { classifyImportedInvoicePaymentSuggestionConfidence } from "./invoice-payment-suggestion-confidence";
import { getInvoicePaymentCycleTargetEstimatedEffect } from "./invoice-payment-cycle-estimate";

const billingConfig = {
  statementClosingDay: 25,
  statementDueDay: 3,
};

const CARD_ACCOUNT_ID = "card-account-1";
const SOURCE_CHECKING_ID = "checking-source-1";

describe("invoice payment cycle target options", () => {
  it("suggests previous cycle as recommended default for typical payment", () => {
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      "2026-06-26",
    );

    expect(options[0]).toMatchObject({
      target: "previous",
      cycleId: "2026-06-25",
      periodLabel: "26/05–25/06",
      recommended: true,
    });
    expect(options[1]).toMatchObject({
      target: "current",
      cycleId: "2026-07-25",
      periodLabel: "26/06–25/07",
    });
  });

  it("lists future cycles after the open statement", () => {
    const future = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      "2026-06-26",
    );

    expect(future[0]?.cycleId).toBe("2026-08-25");
    expect(future[1]?.cycleId).toBe("2026-09-25");
  });

  it("uses next cycle for anticipation when payment is on closing day", () => {
    const anticipated = getAnticipatedStatementCycle(
      billingConfig,
      "2026-06-25",
    );

    expect(anticipated.cycleId).toBe("2026-07-25");
  });
});

describe("getInvoicePaymentCycleTargetImpactMessage", () => {
  const paymentDate = "2026-06-26";
  const options = buildInvoicePaymentCycleTargetOptions(
    billingConfig,
    paymentDate,
  );
  const futureOptions = buildInvoicePaymentFutureCycleOptions(
    billingConfig,
    paymentDate,
  );

  it("describes impact for previous statement", () => {
    expect(
      getInvoicePaymentCycleTargetImpactMessage({
        cycleTargetOptions: options,
        cycleTargetSelection: { target: "previous" },
        futureCycleOptions: futureOptions,
      }),
    ).toEqual({
      text: "Este crédito será aplicado à fatura 26/05–25/06.",
      highlight: "26/05–25/06",
    });
  });

  it("describes impact for current statement as anticipation", () => {
    expect(
      getInvoicePaymentCycleTargetImpactMessage({
        cycleTargetOptions: options,
        cycleTargetSelection: { target: "current" },
        futureCycleOptions: futureOptions,
      }),
    ).toEqual({
      text: "Este crédito será tratado como antecipação da fatura 26/06–25/07 (em aberto).",
      highlight: "26/06–25/07",
    });
  });

  it("describes impact for selected future statement", () => {
    const selected = futureOptions[1]!;

    expect(
      getInvoicePaymentCycleTargetImpactMessage({
        cycleTargetOptions: options,
        cycleTargetSelection: {
          target: "future",
          futureCycleId: selected.cycleId,
        },
        futureCycleOptions: futureOptions,
      }),
    ).toEqual({
      text: `Este crédito será aplicado à fatura futura ${selected.periodLabel}.`,
      highlight: selected.periodLabel,
    });
  });

  it("defaults future impact to the first future cycle when none is selected", () => {
    expect(
      getInvoicePaymentCycleTargetImpactMessage({
        cycleTargetOptions: options,
        cycleTargetSelection: { target: "future" },
        futureCycleOptions: futureOptions,
      }),
    ).toEqual({
      text: `Este crédito será aplicado à fatura futura ${futureOptions[0]!.periodLabel}.`,
      highlight: futureOptions[0]!.periodLabel,
    });
  });
});

describe("invoice payment cycle target radio selection", () => {
  it("parses radio values for previous, current and future", () => {
    expect(parseInvoicePaymentCycleTargetValue("previous")).toBe("previous");
    expect(parseInvoicePaymentCycleTargetValue("current")).toBe("current");
    expect(parseInvoicePaymentCycleTargetValue("future")).toBe("future");
    expect(parseInvoicePaymentCycleTargetValue("invalid")).toBeNull();
  });

  it("marks only the active target as checked", () => {
    const selection = { target: "current" as const };

    expect(isInvoicePaymentCycleTargetChecked(selection, "current")).toBe(true);
    expect(isInvoicePaymentCycleTargetChecked(selection, "previous")).toBe(false);
    expect(isInvoicePaymentCycleTargetChecked(selection, "future")).toBe(false);
  });

  it("updates selection when each option is chosen", () => {
    expect(
      applyInvoicePaymentCycleTargetChange(
        { target: "previous" },
        "current",
      ).target,
    ).toBe("current");

    expect(
      applyInvoicePaymentCycleTargetChange(
        { target: "current", futureCycleId: "2026-08-25" },
        "future",
      ),
    ).toEqual({
      target: "future",
      futureCycleId: "2026-08-25",
    });
  });

  it("keeps impact, estimate and confidence in sync when target changes", () => {
    const billingConfig = {
      statementClosingDay: 25,
      statementDueDay: 3,
    };
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

    const previousSelection = applyInvoicePaymentCycleTargetChange(
      getDefaultInvoicePaymentCycleTargetSelection(),
      "previous",
    );
    const currentSelection = applyInvoicePaymentCycleTargetChange(
      previousSelection,
      "current",
    );

    const previousImpact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: options,
      cycleTargetSelection: previousSelection,
      futureCycleOptions: futureOptions,
    });
    const currentImpact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: options,
      cycleTargetSelection: currentSelection,
      futureCycleOptions: futureOptions,
    });

    const previousEstimate = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate,
      creditAmount: 500,
      cycleTargetSelection: previousSelection,
      transactions,
    });
    const currentEstimate = getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate,
      creditAmount: 500,
      cycleTargetSelection: currentSelection,
      transactions,
    });

    const confidence = classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId: CARD_ACCOUNT_ID,
      paymentDate,
      creditAmount: 500,
      transactions,
    });

    expect(previousImpact?.text).toContain("26/05–25/06");
    expect(currentImpact?.text).toContain("antecipação");
    expect(previousEstimate?.target).toBe("previous");
    expect(currentEstimate?.target).toBe("current");
    expect(previousEstimate?.text).not.toBe(currentEstimate?.text);
    expect(confidence?.confidence).toBeTruthy();
  });
});

describe("resolveInvoicePaymentCycleTarget", () => {
  it("applies credit to previous statement by default", () => {
    const cycle = resolveInvoicePaymentCycleTarget(
      billingConfig,
      "2026-06-26",
      getDefaultInvoicePaymentCycleTargetSelection(),
    );

    expect(cycle.cycleId).toBe("2026-06-25");
    expect(
      resolveImportedInvoicePayment({
        paymentDate: "2026-06-26",
        billingConfig,
      })?.cycleId,
    ).toBe(cycle.cycleId);
  });

  it("applies credit to current statement as anticipation", () => {
    const cycle = resolveInvoicePaymentCycleTarget(billingConfig, "2026-06-26", {
      target: "current",
    });

    expect(cycle.cycleId).toBe("2026-07-25");

    const settlement = getStatementSettlement({
      accountId: CARD_ACCOUNT_ID,
      config: billingConfig,
      cycle,
      referenceDate: "2026-07-01",
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-07-10",
          type: "expense",
          amount: 500,
          description: "Compra fatura atual",
        },
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-26",
          type: "income",
          amount: 500,
          description: "Pagamento recebido",
          statementCycleId: cycle.cycleId,
        },
      ],
    });

    expect(settlement.paidTotal).toBe(500);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("applies credit to a selected future statement", () => {
    const futureOptions = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      "2026-06-26",
    );
    const selected = futureOptions[1]!;

    const cycle = resolveInvoicePaymentCycleTarget(billingConfig, "2026-06-26", {
      target: "future",
      futureCycleId: selected.cycleId,
    });

    expect(cycle.cycleId).toBe("2026-09-25");
  });
});

describe("invoice payment commit respects cycle target", () => {
  it("maps payment legs to the selected cycle", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 100,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const row = preview.rows[0]!;
    const currentCycleId = resolveImportedInvoicePaymentCycleId({
      billingConfig,
      paymentDate: row.date,
      selection: { target: "current" },
    });

    const drafts = mapImportRowToTransactions(
      row,
      CARD_ACCOUNT_ID,
      SOURCE_CHECKING_ID,
      billingConfig,
      "payment",
      { [row.sourceLine]: { target: "current" } },
    );

    expect(drafts[0]?.statementCycleId).toBe(currentCycleId);
    expect(drafts[1]?.statementCycleId).toBe(currentCycleId);
    expect(drafts[0]?.statementCycleId).toBe("2026-07-25");
  });

  it("includes selected cycle in commit RPC payload", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 200,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const line = preview.rows[0]!.sourceLine;
    const futureId = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      "2026-06-26",
    )[0]!.cycleId;

    const payload = buildCommitImportRpcPayload({
      preview,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: { [line]: SOURCE_CHECKING_ID },
      invoicePaymentCycleTargets: {
        [line]: { target: "future", futureCycleId: futureId },
      },
      ownerUserId: "user-1",
      familyId: null,
      fileName: "card.csv",
      contentHash: hashImportContent("hash"),
      targetAccount: {
        type: "credit_card",
        statement_closing_day: 25,
        statement_due_day: 3,
      },
    });

    expect(payload[0]?.transactions).toEqual([
      expect.objectContaining({
        account_id: SOURCE_CHECKING_ID,
        statement_cycle_id: futureId,
      }),
      expect.objectContaining({
        account_id: CARD_ACCOUNT_ID,
        statement_cycle_id: futureId,
      }),
    ]);
  });

  it("keeps previous-cycle mapping without explicit selection (regression)", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 3.598,45"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const row = preview.rows[0]!;
    const payload = buildCommitImportRowPayload(
      row,
      CARD_ACCOUNT_ID,
      "identity",
      { [row.sourceLine]: SOURCE_CHECKING_ID },
      resolveImportBillingConfig({
        type: "credit_card",
        statement_closing_day: 25,
        statement_due_day: 3,
      }),
    );

    expect(payload.transactions[0]?.statementCycleId).toBe("2026-06-25");
    expect(payload.transactions[1]?.statementCycleId).toBe("2026-06-25");
  });
});
