import { describe, expect, it } from "vitest";

import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";

import { ALL_ACCOUNTS_FILTER, filterTransactionsByAccount } from "./lancamentos-filters";
import {
  buildTransactionSearchIndex,
  filterTransactionsBySearch,
  LANCAMENTOS_SEARCH_DEBOUNCE_MS,
  normalizeAppliedSearchTerm,
  normalizeSearchText,
  parseSearchFromSearchParams,
  transactionMatchesSearch,
} from "./lancamentos-search";

function makeAccount(
  partial: Pick<Account, "id" | "name" | "type">,
): Pick<Account, "id" | "name" | "type"> {
  return partial;
}

function makeTx(
  partial: Pick<
    Transaction,
    | "id"
    | "description"
    | "amount"
    | "type"
    | "categoryId"
    | "accountId"
    | "date"
  >,
): Pick<
  Transaction,
  | "id"
  | "description"
  | "amount"
  | "type"
  | "categoryId"
  | "accountId"
  | "date"
> {
  return partial;
}

const accountsById = new Map([
  ["checking-1", makeAccount({ id: "checking-1", name: "Nubank", type: "checking" })],
  [
    "card-1",
    makeAccount({ id: "card-1", name: "Cartão Nubank", type: "credit_card" }),
  ],
]);

const categoriesById = new Map([
  ["cat-saude", { id: "cat-saude", name: "Saúde" }],
  ["cat-assinaturas", { id: "cat-assinaturas", name: "Assinaturas" }],
]);

const lookups = { accountsById, categoriesById };

const netflix = makeTx({
  id: "t-netflix",
  description: "Netflix.Com",
  amount: 59.9,
  type: "expense",
  categoryId: "cat-assinaturas",
  accountId: "card-1",
  date: "2026-07-10",
});

const unimed = makeTx({
  id: "t-unimed",
  description: "UNIMED",
  amount: 450,
  type: "expense",
  categoryId: "cat-saude",
  accountId: "checking-1",
  date: "2026-07-05",
});

const salary = makeTx({
  id: "t-salary",
  description: "Salário",
  amount: 5000,
  type: "income",
  categoryId: null,
  accountId: "checking-1",
  date: "2026-07-01",
});

const invoiceCard = makeTx({
  id: "t-invoice-card",
  description: "Pagamento recebido",
  amount: 1200,
  type: "income",
  categoryId: null,
  accountId: "card-1",
  date: "2026-06-26",
});

const transferManual = makeTx({
  id: "t-transfer",
  description: "Transferência para Carteira",
  amount: 200,
  type: "transfer",
  categoryId: null,
  accountId: "checking-1",
  date: "2026-07-12",
});

const allTx = [netflix, unimed, salary, invoiceCard];

describe("normalizeSearchText", () => {
  it("is case-insensitive and strips accents", () => {
    expect(normalizeSearchText("Saúde")).toBe("saude");
    expect(normalizeSearchText("  NETFLIX  ")).toBe("netflix");
  });
});

describe("parseSearchFromSearchParams / normalizeAppliedSearchTerm", () => {
  it("parses and trims URL search terms", () => {
    expect(parseSearchFromSearchParams("netflix")).toBe("netflix");
    expect(parseSearchFromSearchParams("sa%C3%BAde")).toBe("saúde");
    expect(parseSearchFromSearchParams(null)).toBe("");
    expect(normalizeAppliedSearchTerm("  unimed  ")).toBe("unimed");
  });
});

describe("filterTransactionsBySearch", () => {
  const index = buildTransactionSearchIndex(allTx, lookups);

  it("finds by description (partial)", () => {
    const rows = filterTransactionsBySearch(allTx, "net", index);
    expect(rows.map((row) => row.id)).toEqual(["t-netflix"]);
  });

  it("finds by category name with accent tolerance", () => {
    const rows = filterTransactionsBySearch(allTx, "saude", index);
    expect(rows.map((row) => row.id)).toEqual(["t-unimed"]);
  });

  it("finds by account/card name", () => {
    const byCard = filterTransactionsBySearch(allTx, "cartão nubank", index);
    expect(byCard.map((row) => row.id).sort()).toEqual([
      "t-invoice-card",
      "t-netflix",
    ]);

    const byBank = filterTransactionsBySearch(allTx, "nubank", index);
    expect(byBank.length).toBeGreaterThanOrEqual(3);
  });

  it("finds by type label and raw type", () => {
    expect(
      filterTransactionsBySearch(allTx, "receita", index).map((row) => row.id),
    ).toEqual(["t-salary", "t-invoice-card"]);

    expect(
      filterTransactionsBySearch(allTx, "despesa", index).map((row) => row.id),
    ).toEqual(["t-netflix", "t-unimed"]);

    expect(
      filterTransactionsBySearch(allTx, "expense", index).map((row) => row.id),
    ).toEqual(["t-netflix", "t-unimed"]);
  });

  it("finds by textual amount", () => {
    const rows = filterTransactionsBySearch(allTx, "59,90", index);
    expect(rows.map((row) => row.id)).toEqual(["t-netflix"]);
  });

  it("finds by account kind label cartão", () => {
    const rows = filterTransactionsBySearch(allTx, "cartao", index);
    expect(rows.map((row) => row.id).sort()).toEqual([
      "t-invoice-card",
      "t-netflix",
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterTransactionsBySearch(allTx, "xyz-inexistente", index)).toEqual(
      [],
    );
  });

  it("returns all rows for empty query", () => {
    expect(filterTransactionsBySearch(allTx, "   ", index)).toHaveLength(4);
  });

  it("works with Todas as contas then account-specific filter", () => {
    const consolidated = filterTransactionsByAccount(allTx, ALL_ACCOUNTS_FILTER);
    const searched = filterTransactionsBySearch(consolidated, "unimed", index);
    expect(searched.map((row) => row.id)).toEqual(["t-unimed"]);

    const onlyCard = filterTransactionsByAccount(allTx, "card-1");
    const cardSearch = filterTransactionsBySearch(onlyCard, "netflix", index);
    expect(cardSearch.map((row) => row.id)).toEqual(["t-netflix"]);

    const cardMiss = filterTransactionsBySearch(onlyCard, "unimed", index);
    expect(cardMiss).toEqual([]);
  });

  it("matches invoice payment labels", () => {
    const rows = filterTransactionsBySearch(
      allTx,
      "pagamento de fatura",
      index,
    );
    expect(rows.map((row) => row.id)).toContain("t-invoice-card");
  });

  it("finds by origin Manual and Importado", () => {
    const origins = new Map([
      ["t-netflix", "imported" as const],
      ["t-unimed", "manual" as const],
      ["t-salary", "manual" as const],
      ["t-invoice-card", "imported" as const],
      ["t-transfer", "manual" as const],
    ]);
    const withOrigins = buildTransactionSearchIndex(
      [...allTx, transferManual],
      lookups,
      origins,
    );

    const imported = filterTransactionsBySearch(
      [...allTx, transferManual],
      "importado",
      withOrigins,
    );
    expect(imported.map((row) => row.id).sort()).toEqual([
      "t-invoice-card",
      "t-netflix",
    ]);

    const manual = filterTransactionsBySearch(
      [...allTx, transferManual],
      "manual",
      withOrigins,
    );
    expect(manual.map((row) => row.id).sort()).toEqual([
      "t-salary",
      "t-transfer",
      "t-unimed",
    ]);
  });
});

describe("transactionMatchesSearch", () => {
  it("supports immediate apply semantics used by Enter / Filtrar", () => {
    const haystack = normalizeSearchText("netflix.com assinaturas cartao 59,90");
    expect(transactionMatchesSearch(haystack, "NET")).toBe(true);
    expect(transactionMatchesSearch(haystack, "uber")).toBe(false);
  });

  it("requires every token for multi-word queries (AND)", () => {
    const haystack = normalizeSearchText(
      "netflix.com despesa assinaturas cartao 59,90 importado",
    );
    expect(transactionMatchesSearch(haystack, "netflix despesa")).toBe(true);
    expect(transactionMatchesSearch(haystack, "netflix receita")).toBe(false);
  });
});

describe("URL search persistence helpers", () => {
  it("round-trips search terms for query params", () => {
    const applied = normalizeAppliedSearchTerm("  Netflix  ");
    expect(applied).toBe("Netflix");
    expect(parseSearchFromSearchParams(encodeURIComponent(applied))).toBe(
      "Netflix",
    );
  });

  it("keeps debounce in the hybrid UX window", () => {
    expect(LANCAMENTOS_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(LANCAMENTOS_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });
});
