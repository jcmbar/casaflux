import { describe, expect, it } from "vitest";

import {
  inferImportStatementClosing,
  resolveMaterializedImportStatementFileCycle,
} from "@/lib/integrations/invoice-payment/infer-import-statement-closing";

describe("inferImportStatementClosing", () => {
  it("returns none when due date is invalid", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "",
        statementPeriod: { start: "2026-05-01", end: "2026-05-20" },
      }),
    ).toEqual({
      confidence: "none",
      closingDate: null,
      reason: "Vencimento inválido ou ausente.",
    });
  });

  it("uses statement period end as informational closing", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-06-01",
        statementPeriod: { start: "2026-05-01", end: "2026-05-20" },
      }),
    ).toMatchObject({
      confidence: "high",
      closingDate: "2026-05-20",
    });
  });

  it("warns when period end is after due", () => {
    expect(
      inferImportStatementClosing({
        dueDate: "2026-05-15",
        statementPeriod: { start: "2026-05-01", end: "2026-05-20" },
      }),
    ).toMatchObject({
      confidence: "low",
      closingDate: "2026-05-20",
    });
  });
});

describe("resolveMaterializedImportStatementFileCycle", () => {
  it("materializes identity = due date and period from CSV", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-29",
      statementPeriod: { start: "2026-05-20", end: "2026-06-18" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cycle).toEqual({
      // Never invent 30/06 from card closing day — identity is the due informed.
      closingDate: "2026-06-29",
      dueDate: "2026-06-29",
      periodStart: "2026-05-20",
      periodEnd: "2026-06-18",
    });
  });

  it("requires a statement period from the CSV", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "2026-06-01",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/período/i);
  });

  it("requires due date", () => {
    const result = resolveMaterializedImportStatementFileCycle({
      dueDate: "",
      statementPeriod: { start: "2026-05-01", end: "2026-05-20" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/vencimento/i);
  });
});
