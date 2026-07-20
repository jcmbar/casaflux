import { describe, expect, it } from "vitest";

import {
  applyLancamentosQuickFilters,
  getLancamentosListEmptyCopy,
  parseLancamentosOriginFilter,
  parseLancamentosTypeFilter,
} from "./lancamentos-quick-filters";

const txs = [
  { id: "1", type: "expense" as const },
  { id: "2", type: "income" as const },
  { id: "3", type: "transfer" as const },
  { id: "4", type: "expense" as const },
];

const origins = new Map([
  ["1", "imported" as const],
  ["2", "manual" as const],
  ["3", "manual" as const],
  ["4", "manual" as const],
]);

describe("parseLancamentosTypeFilter / parseLancamentosOriginFilter", () => {
  it("parses known values and falls back to all", () => {
    expect(parseLancamentosTypeFilter("expense")).toBe("expense");
    expect(parseLancamentosTypeFilter("INCOME")).toBe("income");
    expect(parseLancamentosTypeFilter("nope")).toBe("all");
    expect(parseLancamentosOriginFilter("imported")).toBe("imported");
    expect(parseLancamentosOriginFilter(null)).toBe("all");
  });
});

describe("applyLancamentosQuickFilters", () => {
  it("keeps all when filters are all", () => {
    expect(
      applyLancamentosQuickFilters({
        transactions: txs,
        typeFilter: "all",
        originFilter: "all",
        originsByTransactionId: origins,
      }),
    ).toHaveLength(4);
  });

  it("filters by type", () => {
    expect(
      applyLancamentosQuickFilters({
        transactions: txs,
        typeFilter: "expense",
        originFilter: "all",
        originsByTransactionId: origins,
      }).map((row) => row.id),
    ).toEqual(["1", "4"]);
  });

  it("filters by origin", () => {
    expect(
      applyLancamentosQuickFilters({
        transactions: txs,
        typeFilter: "all",
        originFilter: "imported",
        originsByTransactionId: origins,
      }).map((row) => row.id),
    ).toEqual(["1"]);
  });

  it("combines type and origin", () => {
    expect(
      applyLancamentosQuickFilters({
        transactions: txs,
        typeFilter: "expense",
        originFilter: "manual",
        originsByTransactionId: origins,
      }).map((row) => row.id),
    ).toEqual(["4"]);
  });
});

describe("getLancamentosListEmptyCopy", () => {
  it("handles empty loaded set, search/filters, and defaults", () => {
    expect(
      getLancamentosListEmptyCopy({
        hasLoadedTransactions: false,
        searchTerm: "",
        typeFilter: "all",
        originFilter: "all",
        hasAccountFilter: false,
      }).title,
    ).toMatch(/nenhum lançamento/i);

    expect(
      getLancamentosListEmptyCopy({
        hasLoadedTransactions: true,
        searchTerm: "netflix",
        typeFilter: "all",
        originFilter: "all",
        hasAccountFilter: false,
      }).description,
    ).toMatch(/limpe a busca/i);

    expect(
      getLancamentosListEmptyCopy({
        hasLoadedTransactions: true,
        searchTerm: "",
        typeFilter: "expense",
        originFilter: "imported",
        hasAccountFilter: false,
      }).title,
    ).toMatch(/filtros/i);
  });
});
