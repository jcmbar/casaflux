import { describe, expect, it } from "vitest";

import {
  buildImportCategoryFeedback,
  buildImportCategoryFeedbackForSave,
  getImportCategoryFeedbackLabel,
  IMPORT_CATEGORY_FEEDBACK_MS,
  isImportCategoryFeedbackActive,
  pruneExpiredImportCategoryFeedback,
} from "./import-category-feedback";
import type { ImportPreviewRow } from "../types";

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

describe("import category feedback", () => {
  it("labels created and updated feedback", () => {
    expect(getImportCategoryFeedbackLabel("created")).toBe("Nova");
    expect(getImportCategoryFeedbackLabel("updated")).toBe("Atualizada");
  });

  it("highlights a newly created category on the current line", () => {
    const now = 1_000;
    const feedback = buildImportCategoryFeedbackForSave({
      rows: [buildRow({ sourceLine: 3, confirmedCategoryId: "cat-new" })],
      categoryId: "cat-new",
      sourceLine: 3,
      mode: "create",
      now,
    });

    expect(feedback[3]).toEqual({
      kind: "created",
      categoryId: "cat-new",
      until: now + IMPORT_CATEGORY_FEEDBACK_MS,
    });
    expect(isImportCategoryFeedbackActive(feedback[3], "cat-new", now + 100)).toBe(
      true,
    );
  });

  it("highlights updated category names on all affected lines", () => {
    const rows = [
      buildRow({
        sourceLine: 1,
        confirmedCategoryId: "cat-1",
        categorySuggestion: {
          categoryId: "cat-1",
          categoryName: "Mercado",
          confidence: "high",
          source: "exact_match",
          basedOnCount: 1,
        },
      }),
      buildRow({
        sourceLine: 2,
        categorySuggestion: {
          categoryId: "cat-1",
          categoryName: "Mercado",
          confidence: "medium",
          source: "merchant",
          basedOnCount: 2,
        },
      }),
      buildRow({ sourceLine: 3 }),
    ];

    const feedback = buildImportCategoryFeedbackForSave({
      rows,
      categoryId: "cat-1",
      sourceLine: 1,
      mode: "update",
      now: 5_000,
    });

    expect(Object.keys(feedback).map(Number).sort()).toEqual([1, 2]);
    expect(feedback[1]?.kind).toBe("updated");
    expect(feedback[2]?.kind).toBe("updated");
  });

  it("removes expired feedback after the short highlight period", () => {
    const now = 10_000;
    const active = buildImportCategoryFeedback("created", "cat-1", now);
    const expired = buildImportCategoryFeedback("updated", "cat-2", now - 5_000);

    const pruned = pruneExpiredImportCategoryFeedback(
      { 1: active, 2: expired },
      now + 100,
    );

    expect(pruned).toEqual({ 1: active });
    expect(
      isImportCategoryFeedbackActive(active, "cat-1", now + IMPORT_CATEGORY_FEEDBACK_MS),
    ).toBe(false);
    expect(isImportCategoryFeedbackActive(active, "cat-1", now + 100)).toBe(true);
  });
});
