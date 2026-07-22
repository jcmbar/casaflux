import { describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "../types";
import {
  applyBulkConfirmSuggestedCategories,
  formatBulkConfirmSuggestedResultMessage,
  formatBulkConfirmSuggestedSummary,
  getSuggestedReviewLinesForBulkConfirm,
  summarizeSuggestedReviewConfidence,
} from "./import-category-bulk-confirm";

const CATALOG = [
  { id: "cat-food", name: "Mercado", type: "expense" as const },
  { id: "cat-transport", name: "Transporte", type: "expense" as const },
  { id: "cat-other", name: "Outros", type: "expense" as const },
];

function buildRow(
  partial: Partial<ImportPreviewRow> & Pick<ImportPreviewRow, "sourceLine">,
): ImportPreviewRow {
  return {
    source: "nubank_credit_card",
    date: "2026-07-01",
    amount: 10,
    direction: "out",
    description: "Test",
    kind: "card_purchase",
    sourceLine: partial.sourceLine,
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

describe("import-category-bulk-confirm", () => {
  const rows: ImportPreviewRow[] = [
    buildRow({
      sourceLine: 1,
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
      categoryStatus: "suggested",
      categorySuggestion: {
        categoryId: "cat-other",
        categoryName: "Outros",
        confidence: "low",
        source: "historical_frequency",
        basedOnCount: 1,
      },
    }),
    buildRow({
      sourceLine: 4,
      description: "Sem sugestão",
      categoryStatus: "none",
    }),
    buildRow({
      sourceLine: 5,
      categoryStatus: "confirmed",
      confirmedCategoryId: "cat-food",
      categorySuggestion: {
        categoryId: "cat-food",
        categoryName: "Mercado",
        confidence: "high",
        source: "exact_match",
        basedOnCount: 4,
      },
    }),
  ];

  it("summarizes pending suggested rows by confidence", () => {
    expect(summarizeSuggestedReviewConfidence(rows)).toEqual({
      total: 3,
      high: 1,
      medium: 1,
      low: 1,
    });
    expect(formatBulkConfirmSuggestedSummary(summarizeSuggestedReviewConfidence(rows))).toBe(
      "3 sugeridas = 1 alta, 1 média, 1 baixa",
    );
  });

  it("safe scope confirms only high and medium", () => {
    expect(getSuggestedReviewLinesForBulkConfirm(rows, "safe")).toEqual([1, 2]);

    const result = applyBulkConfirmSuggestedCategories({
      rows,
      catalog: CATALOG,
      scope: "safe",
    });

    expect(result.confirmedLines).toEqual([1, 2]);
    expect(result.skippedLowCount).toBe(1);
    expect(result.rows.find((row) => row.sourceLine === 1)?.categoryStatus).toBe(
      "confirmed",
    );
    expect(result.rows.find((row) => row.sourceLine === 2)?.categoryStatus).toBe(
      "confirmed",
    );
    expect(result.rows.find((row) => row.sourceLine === 3)?.categoryStatus).toBe(
      "suggested",
    );
    expect(result.rows.find((row) => row.sourceLine === 4)?.categoryStatus).toBe(
      "none",
    );
    expect(result.rows.find((row) => row.sourceLine === 5)?.categoryStatus).toBe(
      "confirmed",
    );
    expect(
      result.rows.find((row) => row.sourceLine === 1)?.categorySuggestion?.source,
    ).toBe("exact_match");
    expect(
      formatBulkConfirmSuggestedResultMessage({
        confirmedCount: result.confirmedLines.length,
        skippedLowCount: result.skippedLowCount,
        scope: "safe",
      }),
    ).toBe(
      "2 sugestões confirmadas. 1 de baixa confiança ficou para revisão manual.",
    );
  });

  it("all scope also confirms low confidence suggestions", () => {
    const result = applyBulkConfirmSuggestedCategories({
      rows,
      catalog: CATALOG,
      scope: "all",
    });

    expect(result.confirmedLines).toEqual([1, 2, 3]);
    expect(result.skippedLowCount).toBe(0);
    expect(result.rows.find((row) => row.sourceLine === 3)?.categoryStatus).toBe(
      "confirmed",
    );
    expect(result.rows.find((row) => row.sourceLine === 4)?.categoryStatus).toBe(
      "none",
    );
  });
});
