import { describe, expect, it } from "vitest";

import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import { inferImportStatementClosing, resolveMaterializedImportStatementFileCycle } from "@/lib/integrations/invoice-payment/infer-import-statement-closing";

const CONFIG: CreditCardBillingConfig = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

function makeCycle(
  overrides: Partial<CardStatementCycleRecord> &
    Pick<CardStatementCycleRecord, "closingDate" | "dueDate">,
): CardStatementCycleRecord {
  return {
    id: overrides.id ?? `cycle-${overrides.closingDate}`,
    accountId: overrides.accountId ?? "card-1",
    ownerUserId: overrides.ownerUserId ?? "user-1",
    familyId: overrides.familyId ?? null,
    closingDate: overrides.closingDate,
    dueDate: overrides.dueDate,
    periodStart: overrides.periodStart ?? "2026-03-26",
    periodEnd: overrides.periodEnd ?? overrides.closingDate,
    source: overrides.source ?? "imported",
    amountDue: overrides.amountDue ?? 100,
    importBatchId: overrides.importBatchId ?? null,
    notes: overrides.notes ?? null,
  };
}

describe("inferImportStatementClosing", () => {
  it("returns none when due date is invalid", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "",
        billingConfig: CONFIG,
      }),
    ).toEqual({
      confidence: "none",
      closingDate: null,
      reason: "Vencimento inválido ou ausente.",
    });
  });

  it("uses user closing with high confidence", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-01",
        userClosingDate: "2026-05-23",
        billingConfig: CONFIG,
      }),
    ).toMatchObject({
      confidence: "high",
      closingDate: "2026-05-23",
    });
  });

  it("rejects user closing after due", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-01",
        userClosingDate: "2026-06-10",
        billingConfig: CONFIG,
      }),
    ).toMatchObject({
      confidence: "none",
      closingDate: null,
    });
  });

  it("reuses imported cycle closing for the same due (high)", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-01",
        billingConfig: CONFIG,
        importedCycles: [
          makeCycle({
            closingDate: "2026-05-23",
            dueDate: "2026-06-01",
          }),
        ],
      }),
    ).toMatchObject({
      confidence: "high",
      closingDate: "2026-05-23",
    });
  });

  it("returns high when card days exactly reproduce the due", () => {
    // closing 25/05 + due day 1 → due 01/06
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-01",
        billingConfig: CONFIG,
      }),
    ).toMatchObject({
      confidence: "high",
      closingDate: "2026-05-25",
    });
  });

  it("returns low when only the approximate fallback applies", () => {
    // Due day 15 does not match config due day 1 → fallback month-before closing.
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-15",
        billingConfig: CONFIG,
      }),
    ).toMatchObject({
      confidence: "low",
      closingDate: "2026-05-25",
    });
  });

  it("infers billing days from history when card config is missing", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-07-01",
        importedCycles: [
          makeCycle({
            closingDate: "2026-05-25",
            dueDate: "2026-06-01",
          }),
        ],
      }),
    ).toMatchObject({
      confidence: "high",
      closingDate: "2026-06-25",
    });
  });

  it("returns none without config and without history", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-01",
      }),
    ).toMatchObject({
      confidence: "none",
      closingDate: null,
    });
  });
});

describe("resolveMaterializedImportStatementFileCycle", () => {
  it("materializes high confidence without confirmation", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-01",
      billingConfig: CONFIG,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cycle).toEqual({
      closingDate: "2026-05-25",
      dueDate: "2026-06-01",
    });
    expect(result.inference.confidence).toBe("high");
  });

  it("blocks low confidence without confirmation", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-15",
      billingConfig: CONFIG,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/confirme o fechamento/i);
    expect(result.inference.confidence).toBe("low");
  });

  it("materializes low confidence when explicitly confirmed", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-15",
      billingConfig: CONFIG,
      confirmLowConfidenceClosing: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cycle.closingDate).toBe("2026-05-25");
    expect(result.inference.confidence).toBe("low");
  });

  it("blocks none without user closing", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-01",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/fechamento/i);
    expect(result.inference.confidence).toBe("none");
  });

  it("accepts user closing as high materialization", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-01",
      userClosingDate: "2026-05-23",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cycle.closingDate).toBe("2026-05-23");
    expect(result.inference.confidence).toBe("high");
  });
});
