import { describe, expect, it } from "vitest";

import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import {
  applyUniqueAmountMatchToCycleTargetSelection,
  recommendImportedInvoicePaymentTargetByAmount,
} from "@/lib/integrations/invoice-payment/recommend-invoice-payment-target-by-amount";

const CONFIG: CreditCardBillingConfig = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

function makeCycle(
  overrides: Partial<CardStatementCycleRecord> &
    Pick<CardStatementCycleRecord, "closingDate" | "dueDate" | "amountDue">,
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
    amountDue: overrides.amountDue,
    importBatchId: overrides.importBatchId ?? null,
    notes: overrides.notes ?? null,
  };
}

describe("recommendImportedInvoicePaymentTargetByAmount", () => {
  it("returns unique match for a pending imported invoice with same amount", () => {
    const result = recommendImportedInvoicePaymentTargetByAmount({
      paymentAmount: 4654.46,
      paymentDate: "2026-05-02",
      billingConfig: CONFIG,
      cardAccountId: "card-1",
      settlementTransactions: [],
      importedCycles: [
        makeCycle({
          closingDate: "2026-04-25",
          dueDate: "2026-05-01",
          amountDue: 4654.46,
        }),
        makeCycle({
          closingDate: "2026-05-25",
          dueDate: "2026-06-01",
          amountDue: 3598.42,
        }),
      ],
    });

    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.match.dueDate).toBe("2026-05-01");
    expect(result.match.amountDue).toBe(4654.46);
    expect(result.message).toContain("R$");
    expect(result.message).toContain("vencimento");
  });

  it("ignores cycles without real amountDue", () => {
    const result = recommendImportedInvoicePaymentTargetByAmount({
      paymentAmount: 100,
      paymentDate: "2026-05-02",
      importedCycles: [
        makeCycle({
          closingDate: "2026-04-25",
          dueDate: "2026-05-01",
          amountDue: null,
        }),
      ],
    });

    expect(result).toEqual({ kind: "none", matches: [], message: null });
  });

  it("returns ambiguous when two pending invoices share the payment amount", () => {
    const result = recommendImportedInvoicePaymentTargetByAmount({
      paymentAmount: 100,
      paymentDate: "2026-06-02",
      billingConfig: CONFIG,
      cardAccountId: "card-1",
      settlementTransactions: [],
      importedCycles: [
        makeCycle({
          closingDate: "2026-04-25",
          dueDate: "2026-05-01",
          amountDue: 100,
        }),
        makeCycle({
          closingDate: "2026-05-25",
          dueDate: "2026-06-01",
          amountDue: 100,
        }),
      ],
    });

    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") return;
    expect(result.matches).toHaveLength(2);
    expect(result.message).toContain("2 faturas");
  });

  it("excludes already-paid cycles when settlement covers the bill", () => {
    const result = recommendImportedInvoicePaymentTargetByAmount({
      paymentAmount: 200,
      paymentDate: "2026-05-10",
      billingConfig: CONFIG,
      cardAccountId: "card-1",
      settlementTransactions: [
        {
          amount: 200,
          type: "income",
          date: "2026-05-02",
          accountId: "card-1",
          description: "Pagamento de fatura",
          statementCycleId: "2026-04-25",
          invoicePaymentOrigin: "imported",
        },
      ],
      importedCycles: [
        makeCycle({
          closingDate: "2026-04-25",
          dueDate: "2026-05-01",
          amountDue: 200,
        }),
      ],
    });

    expect(result.kind).toBe("none");
  });

  it("does not override an existing user due-date selection", () => {
    const recommendation = recommendImportedInvoicePaymentTargetByAmount({
      paymentAmount: 4654.46,
      paymentDate: "2026-05-02",
      importedCycles: [
        makeCycle({
          closingDate: "2026-04-25",
          dueDate: "2026-05-01",
          amountDue: 4654.46,
        }),
      ],
    });

    const next = applyUniqueAmountMatchToCycleTargetSelection({
      selection: { target: "current", targetDueDate: "2026-06-01" },
      recommendation,
      billingConfig: CONFIG,
      paymentDate: "2026-05-02",
    });

    expect(next).toEqual({
      target: "current",
      targetDueDate: "2026-06-01",
    });
  });

  it("pre-selects unique match when selection has no due date yet", () => {
    const recommendation = recommendImportedInvoicePaymentTargetByAmount({
      paymentAmount: 4654.46,
      paymentDate: "2026-05-02",
      importedCycles: [
        makeCycle({
          closingDate: "2026-04-25",
          dueDate: "2026-05-01",
          amountDue: 4654.46,
        }),
      ],
      billingConfig: CONFIG,
    });

    const next = applyUniqueAmountMatchToCycleTargetSelection({
      selection: { target: "previous" },
      recommendation,
      billingConfig: CONFIG,
      paymentDate: "2026-05-02",
      context: {
        importedCycles: [
          makeCycle({
            closingDate: "2026-04-25",
            dueDate: "2026-05-01",
            amountDue: 4654.46,
          }),
        ],
      },
    });

    expect(next.targetDueDate).toBe("2026-05-01");
  });
});
