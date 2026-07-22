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
  buildInvoicePaymentDueDateOptions,
  buildInvoicePaymentFutureCycleOptions,
  getAnticipatedStatementCycle,
  getDefaultInvoicePaymentCycleTargetSelection,
  getInvoicePaymentCycleTargetImpactMessage,
  applyInvoicePaymentCycleTargetChange,
  applyInvoicePaymentDueDateChange,
  deriveInvoicePaymentSuggestionForDueDate,
  inferInvoicePaymentCycleTargetSelection,
  isInvoicePaymentCycleTargetChecked,
  parseInvoicePaymentCycleTargetValue,
  resolveImportedInvoicePaymentCycleId,
  resolveInvoicePaymentCycleTarget,
  resolveStatementCycleForDueDate,
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

  it("anchors previous/current on the file cycle and shows honest amount gaps", () => {
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      "2026-08-01",
      {
        fileCycle: {
          closingDate: "2026-07-25",
          dueDate: "2026-08-03",
        },
        importedCycles: [
          {
            id: "c1",
            accountId: "card-1",
            ownerUserId: "user-1",
            familyId: null,
            closingDate: "2026-07-25",
            periodStart: "2026-06-26",
            periodEnd: "2026-07-25",
            dueDate: "2026-08-03",
            amountDue: 3844.33,
            source: "imported",
            importBatchId: "b1",
            notes: null,
          },
        ],
      },
    );

    const previous = options.find((option) => option.target === "previous")!;
    const current = options.find((option) => option.target === "current")!;

    expect(previous).toMatchObject({
      cycleId: "2026-07-25",
      amountDue: 3844.33,
      amountKnown: true,
      recommended: true,
    });
    expect(previous.summaryLine).toMatch(/3\.844,33/);
    expect(previous.summaryLine).toMatch(/03\/08\/2026|3 de ago/i);
    expect(current.amountKnown).toBe(false);
    expect(current.summaryLine).toMatch(/Valor ainda não importado/);
  });

  it("prefers real imported dues over card closing/due day fallback", () => {
    // Card cadastro: fecha dia 25 / vence dia 3 — ciclos reais divergem.
    const importedCycles = [
      {
        id: "prev",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-05-12",
        periodStart: "2026-04-13",
        periodEnd: "2026-05-12",
        dueDate: "2026-05-19",
        amountDue: 2100.5,
        source: "imported" as const,
        importBatchId: "b1",
        notes: null,
      },
      {
        id: "curr",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-06-10",
        periodStart: "2026-05-13",
        periodEnd: "2026-06-10",
        dueDate: "2026-06-17",
        amountDue: 3400,
        source: "imported" as const,
        importBatchId: "b2",
        notes: null,
      },
      {
        id: "fut",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-07-11",
        periodStart: "2026-06-11",
        periodEnd: "2026-07-11",
        dueDate: "2026-07-18",
        amountDue: null,
        source: "imported" as const,
        importBatchId: "b3",
        notes: null,
      },
    ];

    const paymentDate = "2026-05-20";
    const context = { importedCycles };
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      paymentDate,
      context,
    );
    const future = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      paymentDate,
      3,
      context,
    );

    const previous = options.find((option) => option.target === "previous")!;
    const current = options.find((option) => option.target === "current")!;

    expect(previous).toMatchObject({
      cycleId: "2026-05-12",
      dueDate: "2026-05-19",
      dueDateLabel: "19/05/2026",
      amountDue: 2100.5,
    });
    expect(current).toMatchObject({
      cycleId: "2026-06-10",
      dueDate: "2026-06-17",
      dueDateLabel: "17/06/2026",
      amountDue: 3400,
    });
    expect(future[0]).toMatchObject({
      cycleId: "2026-07-11",
      dueDate: "2026-07-18",
      dueDateLabel: "18/07/2026",
    });

    // Must not show card-derived dues (03/06, 03/07, …).
    expect(previous.dueDateLabel).not.toMatch(/03\//);
    expect(current.dueDateLabel).not.toMatch(/03\//);
    expect(future[0]!.dueDateLabel).not.toMatch(/03\//);

    const impact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: options,
      cycleTargetSelection: { target: "previous" },
      futureCycleOptions: future,
    });
    expect(impact).toEqual({
      text: `Este crédito quita a fatura anterior com vencimento em ${previous.dueDateLabel}.`,
      highlight: previous.dueDateLabel,
    });

    const currentImpact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: options,
      cycleTargetSelection: { target: "current" },
      futureCycleOptions: future,
    });
    expect(currentImpact?.highlight).toBe(current.dueDateLabel);
  });

  it("falls back to card-derived dues when no imported cycles exist", () => {
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      "2026-06-26",
      { importedCycles: [] },
    );
    const previous = options.find((option) => option.target === "previous")!;
    const current = options.find((option) => option.target === "current")!;

    expect(previous).toMatchObject({
      cycleId: "2026-06-25",
      dueDate: "2026-07-03",
    });
    expect(current).toMatchObject({
      cycleId: "2026-07-25",
      dueDate: "2026-08-03",
    });
  });

  it("uses estimated future only after the last real imported cycle", () => {
    const importedCycles = [
      {
        id: "a",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-05-12",
        periodStart: "2026-04-13",
        periodEnd: "2026-05-12",
        dueDate: "2026-05-19",
        amountDue: 100,
        source: "imported" as const,
        importBatchId: "b1",
        notes: null,
      },
      {
        id: "b",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-06-10",
        periodStart: "2026-05-13",
        periodEnd: "2026-06-10",
        dueDate: "2026-06-17",
        amountDue: 200,
        source: "imported" as const,
        importBatchId: "b2",
        notes: null,
      },
    ];

    const context = { importedCycles };
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      "2026-05-20",
      context,
    );
    const future = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      "2026-05-20",
      2,
      context,
    );

    expect(options.find((option) => option.target === "current")).toMatchObject({
      cycleId: "2026-06-10",
      dueDate: "2026-06-17",
    });
    // No third imported row → first future uses card closing/due day fallback.
    expect(future[0]).toMatchObject({
      cycleId: "2026-07-25",
      dueDate: "2026-08-03",
      dueDateLabel: "03/08/2026",
    });
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
    const previous = options.find((option) => option.target === "previous")!;
    expect(
      getInvoicePaymentCycleTargetImpactMessage({
        cycleTargetOptions: options,
        cycleTargetSelection: { target: "previous" },
        futureCycleOptions: futureOptions,
      }),
    ).toEqual({
      text: `Este crédito quita a fatura anterior com vencimento em ${previous.dueDateLabel}.`,
      highlight: previous.dueDateLabel,
    });
  });

  it("describes impact for current statement as anticipation", () => {
    const current = options.find((option) => option.target === "current")!;
    expect(
      getInvoicePaymentCycleTargetImpactMessage({
        cycleTargetOptions: options,
        cycleTargetSelection: { target: "current" },
        futureCycleOptions: futureOptions,
      }),
    ).toEqual({
      text: `Este crédito antecipa/amortiza a fatura atual com vencimento em ${current.dueDateLabel}.`,
      highlight: current.dueDateLabel,
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
      text: `Este crédito será aplicado à fatura futura com vencimento em ${selected.dueDateLabel}.`,
      highlight: selected.dueDateLabel,
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
      text: `Este crédito será aplicado à fatura futura com vencimento em ${futureOptions[0]!.dueDateLabel}.`,
      highlight: futureOptions[0]!.dueDateLabel,
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

  it("infers previous/current/future from a stored statement_cycle_id", () => {
    const paymentDate = "2026-06-26";
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      paymentDate,
    );
    const futureOptions = buildInvoicePaymentFutureCycleOptions(
      billingConfig,
      paymentDate,
    );

    expect(
      inferInvoicePaymentCycleTargetSelection(
        billingConfig,
        paymentDate,
        options.find((option) => option.target === "previous")!.cycleId,
      ),
    ).toMatchObject({
      target: "previous",
      targetDueDate: options.find((option) => option.target === "previous")!
        .dueDate,
    });

    expect(
      inferInvoicePaymentCycleTargetSelection(
        billingConfig,
        paymentDate,
        options.find((option) => option.target === "current")!.cycleId,
      ),
    ).toMatchObject({
      target: "current",
      targetDueDate: options.find((option) => option.target === "current")!
        .dueDate,
    });

    expect(
      inferInvoicePaymentCycleTargetSelection(
        billingConfig,
        paymentDate,
        futureOptions[0]!.cycleId,
      ),
    ).toMatchObject({
      target: "future",
      futureCycleId: futureOptions[0]!.cycleId,
      targetDueDate: futureOptions[0]!.dueDate,
    });

    expect(
      inferInvoicePaymentCycleTargetSelection(billingConfig, paymentDate, null),
    ).toMatchObject({
      target: "previous",
      targetDueDate: options.find((option) => option.target === "previous")!
        .dueDate,
    });
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

    expect(previousImpact?.text).toContain("03/07/2026");
    expect(currentImpact?.text).toMatch(/antecipa/);
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

  it("treats targetDueDate as the domain source of truth over suggestion buckets", () => {
    const importedCycles = [
      {
        id: "may",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-04-25",
        periodStart: "2026-03-26",
        periodEnd: "2026-04-25",
        dueDate: "2026-05-04",
        amountDue: 3598.45,
        source: "imported" as const,
        importBatchId: "b1",
        notes: null,
      },
      {
        id: "jun",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-05-25",
        periodStart: "2026-04-26",
        periodEnd: "2026-05-25",
        dueDate: "2026-06-01",
        amountDue: 4100,
        source: "imported" as const,
        importBatchId: "b2",
        notes: null,
      },
    ];
    const context = {
      fileCycle: {
        closingDate: "2026-05-25",
        dueDate: "2026-06-01",
      },
      importedCycles,
    };

    // File is the June bill (due 01/06), but payment settles May (due 04/05).
    const cycle = resolveInvoicePaymentCycleTarget(
      billingConfig,
      "2026-05-10",
      {
        target: "current", // misleading suggestion bucket
        targetDueDate: "2026-05-04",
      },
      context,
    );

    expect(cycle.cycleId).toBe("2026-04-25");
    expect(cycle.dueDate).toBe("2026-05-04");

    const settlement = getStatementSettlement({
      accountId: CARD_ACCOUNT_ID,
      config: billingConfig,
      cycle,
      referenceDate: "2026-05-10",
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-04-10",
          type: "expense",
          amount: 3598.45,
        },
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-05-10",
          type: "income",
          amount: 3598.45,
          statementCycleId: cycle.cycleId,
          invoicePaymentOrigin: "imported",
        },
      ],
    });

    expect(settlement.status).toBe("paid");
    expect(settlement.remainingTotal).toBe(0);
  });
});

describe("due-date targeting (primary UX)", () => {
  it("lists imported dues including older bills beyond previous/current", () => {
    const importedCycles = [
      {
        id: "apr",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-03-25",
        periodStart: "2026-02-26",
        periodEnd: "2026-03-25",
        dueDate: "2026-04-01",
        amountDue: 100,
        source: "imported" as const,
        importBatchId: "b0",
        notes: null,
      },
      {
        id: "may",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-04-25",
        periodStart: "2026-03-26",
        periodEnd: "2026-04-25",
        dueDate: "2026-05-04",
        amountDue: 200,
        source: "imported" as const,
        importBatchId: "b1",
        notes: null,
      },
      {
        id: "jun",
        accountId: "card-1",
        ownerUserId: "user-1",
        familyId: null,
        closingDate: "2026-05-25",
        periodStart: "2026-04-26",
        periodEnd: "2026-05-25",
        dueDate: "2026-06-01",
        amountDue: 300,
        source: "imported" as const,
        importBatchId: "b2",
        notes: null,
      },
    ];

    const options = buildInvoicePaymentDueDateOptions(
      billingConfig,
      "2026-05-10",
      {
        fileCycle: { closingDate: "2026-05-25", dueDate: "2026-06-01" },
        importedCycles,
      },
    );

    expect(options.map((option) => option.dueDate)).toEqual(
      expect.arrayContaining(["2026-04-01", "2026-05-04", "2026-06-01"]),
    );

    const picked = applyInvoicePaymentDueDateChange(
      "2026-05-04",
      billingConfig,
      "2026-05-10",
      {
        fileCycle: { closingDate: "2026-05-25", dueDate: "2026-06-01" },
        importedCycles,
      },
    );
    expect(picked.targetDueDate).toBe("2026-05-04");
    // Suggestion bucket depends on anchors (file cycle may make June "previous");
    // due date remains the domain truth.
    expect(
      resolveInvoicePaymentCycleTarget(
        billingConfig,
        "2026-05-10",
        picked,
        {
          fileCycle: { closingDate: "2026-05-25", dueDate: "2026-06-01" },
          importedCycles,
        },
      ),
    ).toMatchObject({
      cycleId: "2026-04-25",
      dueDate: "2026-05-04",
    });
  });

  it("falls back to card-derived closing when due has no imported cycle", () => {
    const cycle = resolveStatementCycleForDueDate(
      billingConfig,
      "2026-08-03",
      { importedCycles: [] },
    );
    expect(cycle.dueDate).toBe("2026-08-03");
    expect(cycle.cycleId).toBe("2026-07-25");
  });

  it("accepts a manual due date outside suggestion buckets without forcing atual/anterior", () => {
    const context = {
      importedCycles: [
        {
          id: "may",
          accountId: "card-1",
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-04-25",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-25",
          dueDate: "2026-05-04",
          amountDue: 3598.45,
          source: "imported" as const,
          importBatchId: "b1",
          notes: null,
        },
      ],
    };

    const selection = applyInvoicePaymentDueDateChange(
      "2026-05-04",
      billingConfig,
      "2026-05-20",
      context,
    );
    expect(selection.targetDueDate).toBe("2026-05-04");

    const cycle = resolveInvoicePaymentCycleTarget(
      billingConfig,
      "2026-05-20",
      selection,
      context,
    );
    expect(cycle).toMatchObject({
      cycleId: "2026-04-25",
      dueDate: "2026-05-04",
    });

    // Custom date not matching synthetic bucket dues → no forced "atual".
    const custom = applyInvoicePaymentDueDateChange(
      "2026-05-03",
      billingConfig,
      "2026-05-20",
      context,
    );
    expect(custom.targetDueDate).toBe("2026-05-03");
    expect(
      deriveInvoicePaymentSuggestionForDueDate(
        "2026-05-03",
        billingConfig,
        "2026-05-20",
        context,
      ),
    ).toBeNull();

    const impact = getInvoicePaymentCycleTargetImpactMessage({
      cycleTargetOptions: buildInvoicePaymentCycleTargetOptions(
        billingConfig,
        "2026-05-20",
        context,
      ),
      cycleTargetSelection: custom,
      futureCycleOptions: [],
    });
    expect(impact?.highlight).toBe("03/05/2026");
    expect(impact?.text).toBe(
      "Este crédito será aplicado à fatura com vencimento em 03/05/2026.",
    );
  });

  it("suggestion chips only fill the due date field", () => {
    const options = buildInvoicePaymentCycleTargetOptions(
      billingConfig,
      "2026-06-26",
    );
    const previous = options.find((option) => option.target === "previous")!;
    const filled = applyInvoicePaymentCycleTargetChange(
      { target: "current", targetDueDate: "2026-01-01" },
      "previous",
      previous.dueDate,
      previous.cycleId,
    );
    expect(filled.targetDueDate).toBe(previous.dueDate);
    expect(filled.target).toBe("previous");
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
