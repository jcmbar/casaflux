import { describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "../types";
import { applyHighConfidenceCategorySuggestions } from "./category-suggestion-service";
import {
  clampAssistedReviewIndex,
  getAssistedReviewRow,
  getImportCategoryReviewProgress,
  getImportCategoryReviewQueue,
  getNextAssistedReviewIndex,
  isImportRowCategorizable,
  partitionImportCategoryReviewRows,
} from "./import-category-review";

const CATEGORIES = [
  { id: "cat-food", name: "Mercado", type: "expense" as const },
  { id: "cat-transport", name: "Transporte", type: "expense" as const },
];

function buildRow(
  partial: Partial<ImportPreviewRow> & Pick<ImportPreviewRow, "sourceLine">,
): ImportPreviewRow {
  return {
    date: "2026-07-01",
    amount: 10,
    direction: "out",
    description: "Test",
    kind: "card_purchase",
    sourceLine: partial.sourceLine,
    externalFingerprint: `fp-${partial.sourceLine}`,
    externalId: null,
    reviewStatus: "ready",
    historicalStatus: "new",
    categoryStatus: "none",
    confirmedCategoryId: null,
    ...partial,
  };
}

describe("import category review modes", () => {
  const rows: ImportPreviewRow[] = [
    buildRow({
      sourceLine: 1,
      description: "Mercado",
      categoryStatus: "suggested",
      categorySuggestion: {
        categoryId: "cat-food",
        categoryName: "Mercado",
        confidence: "high",
        source: "exact_match",
        basedOnCount: 4,
      },
    }),
    buildRow({
      sourceLine: 2,
      description: "Uber",
      categoryStatus: "suggested",
      categorySuggestion: {
        categoryId: "cat-transport",
        categoryName: "Transporte",
        confidence: "medium",
        source: "normalized_merchant",
        basedOnCount: 2,
      },
    }),
    buildRow({
      sourceLine: 3,
      description: "Desconhecido",
      categoryStatus: "none",
    }),
    buildRow({
      sourceLine: 4,
      description: "Já importada",
      historicalStatus: "already_imported",
      reviewStatus: "already_imported",
    }),
  ];

  it("automatic mode applies only high-confidence categories", () => {
    const autoRows = applyHighConfidenceCategorySuggestions(rows, CATEGORIES);
    const partition = partitionImportCategoryReviewRows(autoRows, "automatic");

    expect(partition.autoResolved).toHaveLength(1);
    expect(partition.autoResolved[0]?.sourceLine).toBe(1);
    expect(partition.needsReview).toHaveLength(1);
    expect(partition.needsReview[0]?.sourceLine).toBe(2);
    expect(partition.withoutCategory).toHaveLength(1);
    expect(partition.withoutCategory[0]?.sourceLine).toBe(3);
  });

  it("assisted queue includes all pending categorizable rows", () => {
    const queue = getImportCategoryReviewQueue(rows, "assisted");

    expect(queue.map((row) => row.sourceLine)).toEqual([1, 2, 3]);
  });

  it("assisted mode advances card by card and updates progress", () => {
    let workingRows = [...rows];
    let index = 0;

    expect(getImportCategoryReviewProgress(workingRows).resolved).toBe(0);

    const first = getAssistedReviewRow(workingRows, "assisted", index);
    expect(first?.sourceLine).toBe(1);

    workingRows = workingRows.map((row) =>
      row.sourceLine === 1
        ? {
            ...row,
            categoryStatus: "confirmed" as const,
            confirmedCategoryId: "cat-food",
          }
        : row,
    );

    index = getNextAssistedReviewIndex(index, 3, "confirm");
    expect(getImportCategoryReviewProgress(workingRows).resolved).toBe(1);
    expect(getImportCategoryReviewProgress(workingRows).percent).toBe(33);

    index = clampAssistedReviewIndex(index, getImportCategoryReviewQueue(workingRows, "assisted").length);
    expect(getAssistedReviewRow(workingRows, "assisted", index)?.sourceLine).toBe(2);
  });

  it("manual mode keeps all categorizable rows available for review", () => {
    const partition = partitionImportCategoryReviewRows(rows, "manual");

    expect(partition.pending.map((row) => row.sourceLine)).toEqual([1, 2, 3]);
    expect(isImportRowCategorizable(rows[3]!)).toBe(false);
  });

  it("switching modes preserves confirmed rows", () => {
    const confirmedRows = rows.map((row) =>
      row.sourceLine === 2
        ? {
            ...row,
            categoryStatus: "confirmed" as const,
            confirmedCategoryId: "cat-transport",
          }
        : row,
    );

    expect(
      getImportCategoryReviewQueue(confirmedRows, "assisted").map(
        (row) => row.sourceLine,
      ),
    ).toEqual([1, 3]);

    expect(
      partitionImportCategoryReviewRows(confirmedRows, "automatic").confirmed,
    ).toHaveLength(1);
  });

  it("excludes card invoice payments from category review", () => {
    const invoiceRow = buildRow({
      sourceLine: 9,
      description: "Pagamento recebido",
      kind: "card_invoice_payment",
      direction: "in",
      reviewStatus: "needs_account",
    });

    expect(isImportRowCategorizable(invoiceRow)).toBe(false);
    expect(
      getImportCategoryReviewQueue([invoiceRow, ...rows], "assisted").map(
        (row) => row.sourceLine,
      ),
    ).not.toContain(9);
  });

  it("skip wraps assisted index within the pending queue", () => {
    expect(getNextAssistedReviewIndex(1, 3, "skip")).toBe(2);
    expect(getNextAssistedReviewIndex(2, 3, "skip")).toBe(0);
  });
});
