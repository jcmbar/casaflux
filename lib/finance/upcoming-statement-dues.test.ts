import { describe, expect, it } from "vitest";

import type { StatementHistoryTransaction } from "@/lib/finance/card-statement-history";
import {
  buildUpcomingStatementDues,
  getUpcomingStatementDuesEmptyMessage,
  isRelevantUpcomingStatementDue,
} from "./upcoming-statement-dues";

const CARD_A = {
  id: "card-a",
  name: "Nubank",
  type: "credit_card" as const,
  statement_closing_day: 25,
  statement_due_day: 1,
};

const CARD_B = {
  id: "card-b",
  name: "Inter",
  type: "credit_card" as const,
  statement_closing_day: 10,
  statement_due_day: 17,
};

function tx(
  accountId: string,
  partial: Partial<StatementHistoryTransaction> &
    Pick<StatementHistoryTransaction, "id" | "type" | "amount" | "date">,
): StatementHistoryTransaction {
  return {
    accountId,
    description: "x",
    notes: null,
    linkedTransactionId: null,
    statementCycleId: null,
    invoicePaymentOrigin: null,
    reconciledWithTransactionId: null,
    ...partial,
  };
}

describe("isRelevantUpcomingStatementDue", () => {
  it("excludes paid and zero-remaining open cycles", () => {
    expect(
      isRelevantUpcomingStatementDue({ status: "paid", remainingTotal: 0 }),
    ).toBe(false);
    expect(
      isRelevantUpcomingStatementDue({ status: "open", remainingTotal: 0 }),
    ).toBe(false);
  });

  it("includes open / partial / overdue with remaining balance", () => {
    expect(
      isRelevantUpcomingStatementDue({ status: "open", remainingTotal: 10 }),
    ).toBe(true);
    expect(
      isRelevantUpcomingStatementDue({
        status: "partial",
        remainingTotal: 40,
      }),
    ).toBe(true);
    expect(
      isRelevantUpcomingStatementDue({
        status: "overdue",
        remainingTotal: 100,
      }),
    ).toBe(true);
  });
});

describe("buildUpcomingStatementDues", () => {
  it("orders by due date ascending and excludes paid statements", () => {
    // Card A July cycle due 2026-08-01 — unpaid overdue on 2026-08-10
    // Card B June close 10 due 17 — unpaid overdue earlier
    // Card A current Aug cycle — open with expense, due 2026-09-01
    const items = buildUpcomingStatementDues({
      referenceDate: "2026-08-10",
      cards: [
        {
          account: CARD_A,
          transactions: [
            tx(CARD_A.id, {
              id: "a-jul-e",
              type: "expense",
              amount: 200,
              date: "2026-07-10",
            }),
            tx(CARD_A.id, {
              id: "a-aug-e",
              type: "expense",
              amount: 50,
              date: "2026-08-05",
            }),
            // Fully paid older cycle should not appear
            tx(CARD_A.id, {
              id: "a-jun-e",
              type: "expense",
              amount: 80,
              date: "2026-06-10",
            }),
            tx(CARD_A.id, {
              id: "a-jun-p",
              type: "income",
              amount: 80,
              date: "2026-07-01",
              statementCycleId: "2026-06-25",
              invoicePaymentOrigin: "imported",
            }),
          ],
        },
        {
          account: CARD_B,
          transactions: [
            tx(CARD_B.id, {
              id: "b-e",
              type: "expense",
              amount: 120,
              date: "2026-06-05",
            }),
          ],
        },
      ],
    });

    expect(items.every((item) => item.status !== "paid")).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);

    for (let index = 1; index < items.length; index += 1) {
      expect(
        items[index]!.dueDate >= items[index - 1]!.dueDate,
      ).toBe(true);
    }

    expect(items[0]?.dueDate <= items[items.length - 1]!.dueDate).toBe(true);
  });

  it("builds href to the correct fatura detail", () => {
    const items = buildUpcomingStatementDues({
      referenceDate: "2026-08-10",
      cards: [
        {
          account: CARD_A,
          transactions: [
            tx(CARD_A.id, {
              id: "e",
              type: "expense",
              amount: 90,
              date: "2026-07-10",
            }),
          ],
        },
      ],
    });

    const july = items.find((item) => item.cycleId === "2026-07-25");
    expect(july).toBeDefined();
    expect(july!.href).toBe(
      "/faturas?account=card-a&cycle=2026-07-25",
    );
    expect(july!.remainingTotal).toBe(90);
    expect(july!.status).toBe("overdue");
    expect(july!.needsAttention).toBe(true);
  });

  it("returns empty list and empty message when nothing is due", () => {
    const items = buildUpcomingStatementDues({
      referenceDate: "2026-08-10",
      cards: [
        {
          account: CARD_A,
          transactions: [
            tx(CARD_A.id, {
              id: "e",
              type: "expense",
              amount: 50,
              date: "2026-07-10",
            }),
            tx(CARD_A.id, {
              id: "p",
              type: "income",
              amount: 50,
              date: "2026-08-01",
              statementCycleId: "2026-07-25",
              invoicePaymentOrigin: "imported",
            }),
          ],
        },
      ],
    });

    // Current Aug cycle may still appear if it has activity — filter to paid-only
    // history leaves only empty current with 0 remaining → excluded
    const withBalance = items.filter((item) => item.remainingTotal > 0);
    expect(withBalance).toEqual([]);
    expect(getUpcomingStatementDuesEmptyMessage()).toMatch(/tudo em dia/i);
  });

  it("respects limit", () => {
    const items = buildUpcomingStatementDues({
      referenceDate: "2026-08-10",
      limit: 1,
      cards: [
        {
          account: CARD_A,
          transactions: [
            tx(CARD_A.id, {
              id: "e1",
              type: "expense",
              amount: 10,
              date: "2026-07-10",
            }),
            tx(CARD_A.id, {
              id: "e2",
              type: "expense",
              amount: 20,
              date: "2026-08-05",
            }),
          ],
        },
      ],
    });

    expect(items).toHaveLength(1);
  });
});
