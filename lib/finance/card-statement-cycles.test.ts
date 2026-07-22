import { describe, expect, it } from "vitest";

import {
  buildImportedStatementCycleDraft,
  buildInvoicePaymentMissingInvoiceFeedback,
  collapseDerivedCyclesWithImportedDue,
  detectInvoicePaymentAmountDivergence,
  inferCreditCardBillingConfigFromInvoices,
  mergeCardStatementCycleUpsertWithExisting,
  mergeStatementCyclesWithImported,
  parseStatementDueDateFromFileName,
  pruneRedundantImportedStatementCycles,
  resolveStatementDueDayFromImported,
  type CardStatementCycleRecord,
} from "./card-statement-cycles";
import type { StatementCycle } from "./credit-card-billing";

const CONFIG = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

function importedRecord(
  partial: Partial<CardStatementCycleRecord> &
    Pick<CardStatementCycleRecord, "closingDate" | "dueDate">,
): CardStatementCycleRecord {
  return {
    id: `cycle-${partial.closingDate}`,
    accountId: "card-1",
    ownerUserId: "user-1",
    familyId: null,
    periodStart: "2026-06-26",
    periodEnd: "2026-07-25",
    amountDue: 1500,
    source: "imported",
    importBatchId: "batch-1",
    notes: null,
    ...partial,
  };
}

describe("mergeCardStatementCycleUpsertWithExisting", () => {
  it("keeps the original import_batch_id when a later import touches the cycle", () => {
    expect(
      mergeCardStatementCycleUpsertWithExisting({
        incoming: {
          accountId: "card-1",
          ownerUserId: "user-1",
          closingDate: "2026-05-25",
          periodStart: "2026-04-26",
          periodEnd: "2026-05-25",
          dueDate: "2026-06-01",
          amountDue: null,
          source: "imported",
          importBatchId: "batch-new",
          notes: "Ciclo do arquivo novo",
        },
        existing: {
          importBatchId: "batch-old",
          amountDue: 4654.46,
          notes: "Ciclo do arquivo antigo",
        },
      }),
    ).toEqual({
      importBatchId: "batch-old",
      amountDue: 4654.46,
      notes: "Ciclo do arquivo novo",
    });
  });

  it("accepts a new non-null issuer total from a later file", () => {
    expect(
      mergeCardStatementCycleUpsertWithExisting({
        incoming: {
          accountId: "card-1",
          ownerUserId: "user-1",
          closingDate: "2026-05-25",
          periodStart: "2026-04-26",
          periodEnd: "2026-05-25",
          dueDate: "2026-06-01",
          amountDue: 4700,
          source: "imported",
          importBatchId: "batch-new",
        },
        existing: {
          importBatchId: "batch-old",
          amountDue: 4654.46,
          notes: null,
        },
      }).amountDue,
    ).toBe(4700);
  });
});

describe("parseStatementDueDateFromFileName", () => {
  it("extracts ISO date from Nubank-style filenames", () => {
    expect(parseStatementDueDateFromFileName("Nubank_2026-08-01.csv")).toBe(
      "2026-08-01",
    );
  });

  it("returns null when no date is present", () => {
    expect(parseStatementDueDateFromFileName("extrato.csv")).toBeNull();
  });
});

describe("buildImportedStatementCycleDraft", () => {
  it("overrides synthetic due date with the real due date", () => {
    const draft = buildImportedStatementCycleDraft({
      config: CONFIG,
      closingDate: "2026-07-25",
      dueDate: "2026-08-03",
      amountDue: 1234.56,
    });

    expect(draft.source).toBe("imported");
    expect(draft.closingDate).toBe("2026-07-25");
    expect(draft.dueDate).toBe("2026-08-03");
    expect(draft.issuerAmountDue).toBe(1234.56);
  });
});

describe("mergeStatementCyclesWithImported", () => {
  it("prefers imported cycles over derived ones for the same closing", () => {
    const derived: StatementCycle[] = [
      {
        cycleId: "2026-07-25",
        periodStart: "2026-06-26",
        periodEnd: "2026-07-25",
        closingDate: "2026-07-25",
        dueDate: "2026-08-01",
        source: "derived",
      },
    ];

    const merged = mergeStatementCyclesWithImported({
      derivedCycles: derived,
      importedCycles: [
        importedRecord({
          closingDate: "2026-07-25",
          dueDate: "2026-08-03",
          amountDue: 1500,
        }),
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      cycleId: "2026-07-25",
      dueDate: "2026-08-03",
      source: "imported",
      issuerAmountDue: 1500,
    });
  });
});

describe("inferCreditCardBillingConfigFromInvoices", () => {
  it("infers closing/due days from the newest invoice", () => {
    expect(
      inferCreditCardBillingConfigFromInvoices([
        importedRecord({
          closingDate: "2026-04-25",
          dueDate: "2026-05-04",
        }),
      ]),
    ).toEqual({
      statementClosingDay: 25,
      statementDueDay: 4,
    });
  });
});

describe("resolveStatementDueDayFromImported", () => {
  it("uses the newest imported due day-of-month", () => {
    expect(
      resolveStatementDueDayFromImported(CONFIG, [
        importedRecord({
          closingDate: "2026-04-25",
          dueDate: "2026-05-24",
        }),
      ]),
    ).toBe(24);
  });

  it("falls back to the card config due day", () => {
    expect(resolveStatementDueDayFromImported(CONFIG, [])).toBe(1);
  });
});

describe("pruneRedundantImportedStatementCycles", () => {
  it("keeps the payment-linked closing when two imported cycles share a due date", () => {
    const pruned = pruneRedundantImportedStatementCycles({
      cycles: [
        {
          cycleId: "2026-04-24",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-24",
          closingDate: "2026-04-24",
          dueDate: "2026-05-24",
          source: "imported",
        },
        {
          cycleId: "2026-04-25",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-25",
          closingDate: "2026-04-25",
          dueDate: "2026-05-24",
          source: "imported",
        },
        {
          cycleId: "2026-05-25",
          periodStart: "2026-04-26",
          periodEnd: "2026-05-25",
          closingDate: "2026-05-25",
          dueDate: "2026-06-03",
          source: "derived",
        },
      ],
      cycleIdsWithPayments: new Set(["2026-04-25"]),
    });

    expect(pruned.map((cycle) => cycle.cycleId)).toEqual([
      "2026-04-25",
      "2026-05-25",
    ]);
  });

  it("prefers the sibling with issuer amount_due over a later empty closing", () => {
    const pruned = pruneRedundantImportedStatementCycles({
      cycles: [
        {
          cycleId: "2026-06-23",
          periodStart: "2026-05-26",
          periodEnd: "2026-06-23",
          closingDate: "2026-06-23",
          dueDate: "2026-07-01",
          source: "imported",
          issuerAmountDue: 3598.45,
        },
        {
          cycleId: "2026-06-25",
          periodStart: "2026-05-26",
          periodEnd: "2026-06-25",
          closingDate: "2026-06-25",
          dueDate: "2026-07-01",
          source: "imported",
          issuerAmountDue: null,
        },
      ],
      cycleIdsWithPayments: new Set(["2026-06-23"]),
      dueDatesWithPayments: new Set(["2026-07-01"]),
    });

    expect(pruned).toHaveLength(1);
    expect(pruned[0]).toMatchObject({
      cycleId: "2026-06-23",
      issuerAmountDue: 3598.45,
    });
  });
});

describe("collapseDerivedCyclesWithImportedDue", () => {
  it("drops derived twins that share a due date with an imported invoice", () => {
    expect(
      collapseDerivedCyclesWithImportedDue([
        {
          cycleId: "2026-07-25",
          periodStart: "2026-06-26",
          periodEnd: "2026-07-25",
          closingDate: "2026-07-25",
          dueDate: "2026-08-03",
          source: "derived",
        },
        {
          cycleId: "2026-07-20",
          periodStart: "2026-06-26",
          periodEnd: "2026-07-20",
          closingDate: "2026-07-20",
          dueDate: "2026-08-03",
          source: "imported",
          issuerAmountDue: 4152.31,
        },
      ]).map((cycle) => cycle.cycleId),
    ).toEqual(["2026-07-20"]);
  });
});

describe("detectInvoicePaymentAmountDivergence", () => {
  it("returns null within tolerance", () => {
    expect(
      detectInvoicePaymentAmountDivergence({
        paymentAmount: 100,
        expectedAmountDue: 100.04,
      }),
    ).toBeNull();
  });

  it("explains underpayments against a real invoice total", () => {
    const feedback = detectInvoicePaymentAmountDivergence({
      paymentAmount: 80,
      expectedAmountDue: 100,
      dueDateLabel: "01/06/2026",
    });

    expect(feedback?.kind).toBe("mismatch");
    expect(feedback?.difference).toBe(-20);
    expect(feedback?.message).toContain("Pagamento menor que a fatura selecionada");
    expect(feedback?.message).toContain("R$ 80,00");
    expect(feedback?.message).toContain("total de R$ 100,00");
    expect(feedback?.message).toContain("01/06/2026");
    expect(feedback?.message).not.toMatch(/estimado|divergência|ciclo/i);
  });

  it("explains overpayments against a real invoice total", () => {
    const feedback = detectInvoicePaymentAmountDivergence({
      paymentAmount: 3844.33,
      expectedAmountDue: 863.46,
      dueDateLabel: "04/05/2026",
    });

    expect(feedback?.kind).toBe("mismatch");
    expect(feedback?.difference).toBe(2980.87);
    expect(feedback?.message).toContain("Pagamento maior que a fatura selecionada");
    expect(feedback?.message).toContain("R$ 3.844,33");
    expect(feedback?.message).toContain("total de R$ 863,46");
    expect(feedback?.message).not.toMatch(/estimado|ciclo/i);
  });
});

describe("buildInvoicePaymentMissingInvoiceFeedback", () => {
  it("explains that no real invoice exists for the due date", () => {
    const feedback = buildInvoicePaymentMissingInvoiceFeedback({
      paymentAmount: 3844.33,
      dueDateLabel: "04/05/2026",
    });

    expect(feedback.kind).toBe("no_invoice");
    expect(feedback.expectedAmountDue).toBeNull();
    expect(feedback.difference).toBeNull();
    expect(feedback.message).toContain("Não encontramos uma fatura");
    expect(feedback.message).toContain("04/05/2026");
    expect(feedback.message).toContain("R$ 3.844,33");
    expect(feedback.message).toContain("pagamento total/manual");
    expect(feedback.message).not.toMatch(/estimado|divergência|ciclo/i);
  });
});
