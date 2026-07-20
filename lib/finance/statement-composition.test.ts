import { describe, expect, it } from "vitest";

import {
  buildStatementComposition,
  classifyStatementCompositionExpense,
  STATEMENT_COMPOSITION_GROUP_LABELS,
  type StatementCompositionTransaction,
} from "./statement-composition";

const CONFIG = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

const CYCLE = {
  cycleId: "2026-07-25",
  periodStart: "2026-06-26",
  periodEnd: "2026-07-25",
  closingDate: "2026-07-25",
  dueDate: "2026-08-01",
};

const CARD_ID = "card-1";

function expense(
  partial: Partial<StatementCompositionTransaction> &
    Pick<StatementCompositionTransaction, "id" | "amount" | "date">,
): StatementCompositionTransaction {
  return {
    accountId: CARD_ID,
    type: "expense",
    description: partial.description ?? "Compra",
    ...partial,
  };
}

describe("classifyStatementCompositionExpense", () => {
  it("puts in-cycle expenses in cycle and near-close posts in rolled_in", () => {
    expect(
      classifyStatementCompositionExpense({
        transaction: expense({ id: "1", amount: 10, date: "2026-07-10" }),
        cardAccountId: CARD_ID,
        cycle: CYCLE,
        config: CONFIG,
      }),
    ).toBe("cycle");

    // Previous closing is 2026-06-25; window starts 2026-06-24.
    expect(
      classifyStatementCompositionExpense({
        transaction: expense({ id: "2", amount: 20, date: "2026-06-25" }),
        cardAccountId: CARD_ID,
        cycle: CYCLE,
        config: CONFIG,
      }),
    ).toBe("rolled_in");

    expect(
      classifyStatementCompositionExpense({
        transaction: expense({ id: "3", amount: 5, date: "2026-06-20" }),
        cardAccountId: CARD_ID,
        cycle: CYCLE,
        config: CONFIG,
      }),
    ).toBeNull();
  });
});

describe("buildStatementComposition", () => {
  it("equals cycle-only when there are no rolled-in expenses", () => {
    const composition = buildStatementComposition({
      cardAccountId: CARD_ID,
      config: CONFIG,
      cycle: CYCLE,
      periodLabel: "26/06–25/07",
      transactions: [
        expense({ id: "a", amount: 100, date: "2026-07-01", description: "Loja" }),
        expense({ id: "b", amount: 40, date: "2026-07-15", description: "App" }),
      ],
    });

    expect(composition.isCycleOnly).toBe(true);
    expect(composition.hasRolledIn).toBe(false);
    expect(composition.cyclePurchasesTotal).toBe(140);
    expect(composition.rolledInPurchasesTotal).toBe(0);
    expect(composition.amountDueTotal).toBe(140);
    expect(composition.cycleLines).toHaveLength(2);
    expect(composition.rolledInLines).toHaveLength(0);
    expect(composition.equationSummary).toMatch(/não há lançamentos da virada/i);
    expect(STATEMENT_COMPOSITION_GROUP_LABELS.cycle).toBe("Despesas do ciclo");
  });

  it("shows amount due greater than cycle expenses when rolled-in exists", () => {
    const composition = buildStatementComposition({
      cardAccountId: CARD_ID,
      config: CONFIG,
      cycle: CYCLE,
      periodLabel: "26/06–25/07",
      transactions: [
        expense({
          id: "cycle-1",
          amount: 100,
          date: "2026-07-10",
          description: "Mercado",
        }),
        expense({
          id: "roll-1",
          amount: 50,
          date: "2026-06-25",
          description: "Parcela 3/12",
        }),
        expense({
          id: "roll-2",
          amount: 25,
          date: "2026-06-24",
          description: "Assinatura",
        }),
      ],
    });

    expect(composition.isCycleOnly).toBe(false);
    expect(composition.hasRolledIn).toBe(true);
    expect(composition.cyclePurchasesTotal).toBe(100);
    expect(composition.rolledInPurchasesTotal).toBe(75);
    expect(composition.amountDueTotal).toBe(175);
    expect(composition.cycleLines.map((line) => line.id)).toEqual(["cycle-1"]);
    expect(composition.rolledInLines.map((line) => line.id).sort()).toEqual([
      "roll-1",
      "roll-2",
    ]);
    expect(composition.equationSummary).toMatch(/virada do fechamento/i);
    expect(STATEMENT_COMPOSITION_GROUP_LABELS.rolled_in).toBe(
      "Na virada do fechamento",
    );
  });

  it("prefers settlement totals when provided", () => {
    const composition = buildStatementComposition({
      cardAccountId: CARD_ID,
      config: CONFIG,
      cycle: CYCLE,
      periodLabel: "26/06–25/07",
      transactions: [
        expense({ id: "a", amount: 10, date: "2026-07-10" }),
      ],
      settlement: {
        cyclePurchasesTotal: 10,
        rolledInPurchasesTotal: 5,
        amountDueTotal: 15,
      },
    });

    expect(composition.amountDueTotal).toBe(15);
    expect(composition.rolledInPurchasesTotal).toBe(5);
  });
});
