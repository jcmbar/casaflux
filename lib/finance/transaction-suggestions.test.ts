import { describe, expect, it } from "vitest";

import {
  descriptionSimilarity,
  findBestSimilarTransaction,
  findLastUserTransaction,
  normalizeDescription,
  suggestTransactionDraft,
} from "./transaction-suggestions";
import type { Transaction } from "@/types/transaction";

function makeTransaction(
  overrides: Partial<Transaction> & Pick<Transaction, "id">,
): Transaction {
  return {
    description: "Mercado",
    amount: 100,
    type: "expense",
    categoryId: "cat-food",
    accountId: "acc-1",
    linkedTransactionId: null,
    createdBy: "user-1",
    familyId: null,
    date: "2026-07-01",
    createdAt: "2026-07-01T12:00:00Z",
    statementCycleId: null,
    ...overrides,
  };
}

describe("transaction-suggestions", () => {
  it("normalizes descriptions for matching", () => {
    expect(normalizeDescription("Farmácia")).toBe("farmacia");
  });

  it("scores similar descriptions", () => {
    expect(descriptionSimilarity("mercado", "Mercado Extra")).toBeGreaterThan(0.8);
    expect(descriptionSimilarity("uber viagem", "uber trabalho")).toBeGreaterThan(0.3);
  });

  it("finds the most recent similar transaction", () => {
    const history = [
      makeTransaction({
        id: "1",
        description: "Mercado",
        accountId: "acc-a",
        categoryId: "cat-a",
      }),
      makeTransaction({
        id: "2",
        description: "Mercado Extra",
        accountId: "acc-b",
        categoryId: "cat-b",
      }),
    ];

    const match = findBestSimilarTransaction(history, "mercado");
    expect(match?.id).toBe("1");
  });

  it("uses last user transaction when description is empty", () => {
    const history = [
      makeTransaction({
        id: "latest",
        description: "Uber",
        accountId: "acc-wallet",
        categoryId: "cat-transport",
      }),
    ];

    const suggestion = suggestTransactionDraft({
      type: "expense",
      description: "",
      categories: [
        { id: "cat-transport", name: "Transporte", type: "expense" },
        { id: "cat-food", name: "Alimentação", type: "expense" },
      ],
      accounts: [{ id: "acc-wallet", name: "Carteira" } as never],
      history,
      userId: "user-1",
    });

    expect(suggestion.source).toBe("last_user");
    expect(suggestion.accountId).toBe("acc-wallet");
    expect(suggestion.categoryId).toBe("cat-transport");
  });

  it("reuses account and category from similar transaction", () => {
    const history = [
      makeTransaction({
        id: "1",
        description: "Mercado",
        accountId: "acc-nubank",
        categoryId: "cat-food",
      }),
    ];

    const suggestion = suggestTransactionDraft({
      type: "expense",
      description: "mercado",
      categories: [{ id: "cat-food", name: "Alimentação", type: "expense" }],
      accounts: [{ id: "acc-nubank", name: "Nubank" } as never],
      history,
      userId: "user-1",
    });

    expect(suggestion.source).toBe("similar");
    expect(suggestion.accountId).toBe("acc-nubank");
    expect(suggestion.categoryId).toBe("cat-food");
  });

  it("returns null last user transaction for empty history", () => {
    expect(findLastUserTransaction([])).toBeNull();
  });
});
