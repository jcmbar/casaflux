import { describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "../types";
import {
  applyCategoryToImportRowsBatch,
  filterImportRowsByCategoryKeyword,
  formatBatchCategoryApplyMessage,
  resolveBatchApplyTargetLines,
} from "./import-category-batch-filter";

const CATEGORIES = [
  { id: "cat-food", name: "Alimentação", type: "expense" as const },
  { id: "cat-transport", name: "Transporte", type: "expense" as const },
];

function buildRow(
  partial: Partial<ImportPreviewRow> &
    Pick<ImportPreviewRow, "sourceLine" | "description">,
): ImportPreviewRow {
  return {
    source: "nubank_credit_card",
    date: "2026-07-01",
    amount: 10,
    direction: "out",
    kind: "card_purchase",
    externalFingerprint: `fp-${partial.sourceLine}`,
    externalId: null,
    metadata: {},
    reviewStatus: "ready",
    historicalStatus: "new",
    categoryStatus: "none",
    confirmedCategoryId: null,
    ...partial,
  };
}

describe("filterImportRowsByCategoryKeyword", () => {
  const rows = [
    buildRow({
      sourceLine: 1,
      description: "Ifd*Silene Lopes",
      normalizedMerchant: "ifd silene lopes",
    }),
    buildRow({
      sourceLine: 2,
      description: "IFOOD *PEDIDO 123",
      normalizedMerchant: "ifood pedido 123",
    }),
    buildRow({
      sourceLine: 3,
      description: "Uber Trip",
      normalizedMerchant: "uber trip",
    }),
    buildRow({
      sourceLine: 4,
      description: "iFood Pagamento",
      historicalStatus: "already_imported",
      reviewStatus: "already_imported",
    }),
    buildRow({
      sourceLine: 5,
      description: "IFOOD CONFIRMADO",
      normalizedMerchant: "ifood confirmado",
      categoryStatus: "confirmed",
      confirmedCategoryId: "cat-food",
    }),
    buildRow({
      sourceLine: 6,
      description: "Transferencia PIX enviada",
      direction: "out",
      kind: "bank_transfer_out",
      source: "nubank_checking",
    }),
    buildRow({
      sourceLine: 7,
      description: "Transferencia PIX recebida",
      direction: "in",
      kind: "bank_income",
      source: "nubank_checking",
    }),
  ];

  it("filters by description and normalized merchant in real time keyword match", () => {
    const filtered = filterImportRowsByCategoryKeyword(rows, "ifood");
    expect(filtered.map((row) => row.sourceLine)).toEqual([2]);

    const ifd = filterImportRowsByCategoryKeyword(rows, "ifd");
    expect(ifd.map((row) => row.sourceLine)).toEqual([1]);
  });

  it("hides confirmed rows by default and shows them when includeConfirmed is true", () => {
    expect(
      filterImportRowsByCategoryKeyword(rows, "ifood").map((row) => row.sourceLine),
    ).toEqual([2]);
    expect(
      filterImportRowsByCategoryKeyword(rows, "ifood", {
        includeConfirmed: true,
      }).map((row) => row.sourceLine),
    ).toEqual([2, 5]);
  });

  it("filters by transaction type expense vs income", () => {
    expect(
      filterImportRowsByCategoryKeyword(rows, "transfer", {
        typeFilter: "expense",
      }).map((row) => row.sourceLine),
    ).toEqual([6]);
    expect(
      filterImportRowsByCategoryKeyword(rows, "transfer", {
        typeFilter: "income",
      }).map((row) => row.sourceLine),
    ).toEqual([7]);
    expect(
      filterImportRowsByCategoryKeyword(rows, "transfer", {
        typeFilter: "all",
      }).map((row) => row.sourceLine),
    ).toEqual([6, 7]);
  });

  it("ignores already imported rows and empty keywords", () => {
    expect(filterImportRowsByCategoryKeyword(rows, "ifood").map((r) => r.sourceLine)).not.toContain(
      4,
    );
    expect(filterImportRowsByCategoryKeyword(rows, "   ")).toEqual([]);
  });
});

describe("applyCategoryToImportRowsBatch", () => {
  const rows = [
    buildRow({ sourceLine: 1, description: "IFOOD A" }),
    buildRow({
      sourceLine: 2,
      description: "IFOOD B",
      categoryStatus: "confirmed",
      confirmedCategoryId: "cat-transport",
    }),
    buildRow({ sourceLine: 3, description: "Uber" }),
    buildRow({
      sourceLine: 4,
      description: "Transferencia PIX recebida",
      direction: "in",
      kind: "bank_income",
      source: "nubank_checking",
    }),
  ];

  const CATEGORIES_WITH_INCOME = [
    ...CATEGORIES,
    { id: "cat-salary", name: "Salário", type: "income" as const },
  ];

  it("applies category to selected lines without overwriting confirmed by default", () => {
    const result = applyCategoryToImportRowsBatch({
      rows,
      sourceLines: [1, 2],
      categoryId: "cat-food",
      catalog: CATEGORIES,
    });

    expect(result.appliedLines).toEqual([1]);
    expect(result.skippedConfirmedLines).toEqual([2]);
    expect(result.rows.find((row) => row.sourceLine === 1)?.categoryStatus).toBe(
      "confirmed",
    );
    expect(result.rows.find((row) => row.sourceLine === 1)?.confirmedCategoryId).toBe(
      "cat-food",
    );
    expect(result.rows.find((row) => row.sourceLine === 2)?.confirmedCategoryId).toBe(
      "cat-transport",
    );
  });

  it("overwrites confirmed only when explicitly requested", () => {
    const result = applyCategoryToImportRowsBatch({
      rows,
      sourceLines: [2],
      categoryId: "cat-food",
      catalog: CATEGORIES,
      includeConfirmed: true,
    });

    expect(result.appliedLines).toEqual([2]);
    expect(result.rows.find((row) => row.sourceLine === 2)?.confirmedCategoryId).toBe(
      "cat-food",
    );
  });

  it("never applies expense category to income rows", () => {
    const result = applyCategoryToImportRowsBatch({
      rows,
      sourceLines: [1, 4],
      categoryId: "cat-food",
      catalog: CATEGORIES_WITH_INCOME,
    });

    expect(result.appliedLines).toEqual([1]);
    expect(result.skippedTypeMismatchLines).toEqual([4]);
    expect(result.rows.find((row) => row.sourceLine === 4)?.confirmedCategoryId).toBeNull();
  });

  it("resolves filtered vs selected scopes and formats confirmation copy", () => {
    const filtered = filterImportRowsByCategoryKeyword(rows, "ifood");
    expect(filtered.map((row) => row.sourceLine)).toEqual([1]);

    const selectedTargets = resolveBatchApplyTargetLines({
      filteredRows: filtered,
      selectedSourceLines: [1],
      scope: "selected",
      includeConfirmed: false,
    });
    const filteredTargets = resolveBatchApplyTargetLines({
      filteredRows: filtered,
      selectedSourceLines: [],
      scope: "filtered",
      includeConfirmed: false,
    });
    const withConfirmedVisible = filterImportRowsByCategoryKeyword(rows, "ifood", {
      includeConfirmed: true,
    });
    const overwriteTargets = resolveBatchApplyTargetLines({
      filteredRows: withConfirmedVisible,
      selectedSourceLines: [],
      scope: "filtered",
      includeConfirmed: true,
    });

    expect(selectedTargets).toEqual([1]);
    expect(filteredTargets).toEqual([1]);
    expect(overwriteTargets).toEqual([1, 2]);
    expect(
      formatBatchCategoryApplyMessage({
        categoryName: "Alimentação",
        appliedCount: 1,
        skippedConfirmedCount: 1,
      }),
    ).toContain('1 lançamento(s) receberão a categoria "Alimentação"');
  });
});
