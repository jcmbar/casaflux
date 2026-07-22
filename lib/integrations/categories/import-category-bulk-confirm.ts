import type { CategorySuggestionCatalogItem } from "./category-suggester";
import { applyConfirmedCategoryToRow } from "./category-suggestion-service";
import {
  formatCategorySuggestionConfidencePt,
} from "./category-suggestion-origin";
import type {
  ImportCategorySuggestionConfidence,
  ImportPreviewRow,
} from "../types";
import { isImportRowCategorizable } from "./import-category-review";

export type SuggestedReviewConfidenceSummary = {
  total: number;
  high: number;
  medium: number;
  low: number;
};

/** V1 safe default: confirm high + medium; leave low for manual review. */
export type BulkConfirmSuggestionsScope = "safe" | "all";

export function isSuggestedReviewPendingRow(row: ImportPreviewRow): boolean {
  return (
    isImportRowCategorizable(row) &&
    row.categoryStatus === "suggested" &&
    Boolean(row.categorySuggestion)
  );
}

export function summarizeSuggestedReviewConfidence(
  rows: ImportPreviewRow[],
): SuggestedReviewConfidenceSummary {
  const summary: SuggestedReviewConfidenceSummary = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const row of rows) {
    if (!isSuggestedReviewPendingRow(row) || !row.categorySuggestion) {
      continue;
    }

    summary.total += 1;
    summary[row.categorySuggestion.confidence] += 1;
  }

  return summary;
}

function confidenceMatchesScope(
  confidence: ImportCategorySuggestionConfidence,
  scope: BulkConfirmSuggestionsScope,
): boolean {
  if (scope === "all") {
    return true;
  }

  return confidence === "high" || confidence === "medium";
}

export function getSuggestedReviewLinesForBulkConfirm(
  rows: ImportPreviewRow[],
  scope: BulkConfirmSuggestionsScope,
): number[] {
  return rows
    .filter(
      (row) =>
        isSuggestedReviewPendingRow(row) &&
        row.categorySuggestion &&
        confidenceMatchesScope(row.categorySuggestion.confidence, scope),
    )
    .map((row) => row.sourceLine);
}

export function applyBulkConfirmSuggestedCategories(input: {
  rows: ImportPreviewRow[];
  catalog: CategorySuggestionCatalogItem[];
  scope: BulkConfirmSuggestionsScope;
}): {
  rows: ImportPreviewRow[];
  confirmedLines: number[];
  skippedLowCount: number;
  summary: SuggestedReviewConfidenceSummary;
} {
  const summary = summarizeSuggestedReviewConfidence(input.rows);
  const targetLines = new Set(
    getSuggestedReviewLinesForBulkConfirm(input.rows, input.scope),
  );

  const confirmedLines: number[] = [];
  const nextRows = input.rows.map((row) => {
    if (!targetLines.has(row.sourceLine) || !row.categorySuggestion) {
      return row;
    }

    confirmedLines.push(row.sourceLine);
    return applyConfirmedCategoryToRow(
      row,
      row.categorySuggestion.categoryId,
      input.catalog,
    );
  });

  return {
    rows: nextRows,
    confirmedLines,
    skippedLowCount: input.scope === "safe" ? summary.low : 0,
    summary,
  };
}

export function formatBulkConfirmSuggestedSummary(
  summary: SuggestedReviewConfidenceSummary,
): string {
  if (summary.total === 0) {
    return "Nenhuma sugestão pendente de revisão.";
  }

  const parts = (
    [
      ["high", summary.high],
      ["medium", summary.medium],
      ["low", summary.low],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(
      ([confidence, count]) =>
        `${count} ${formatCategorySuggestionConfidencePt(confidence).toLowerCase()}`,
    );

  return `${summary.total} sugerida${summary.total === 1 ? "" : "s"} = ${parts.join(", ")}`;
}

export function formatBulkConfirmSuggestedResultMessage(input: {
  confirmedCount: number;
  skippedLowCount: number;
  scope: BulkConfirmSuggestionsScope;
}): string {
  if (input.confirmedCount === 0) {
    return "Nenhuma sugestão foi confirmada.";
  }

  const base =
    input.confirmedCount === 1
      ? "1 sugestão confirmada."
      : `${input.confirmedCount} sugestões confirmadas.`;

  if (input.scope === "safe" && input.skippedLowCount > 0) {
    return `${base} ${input.skippedLowCount} de baixa confiança ${
      input.skippedLowCount === 1 ? "ficou" : "ficaram"
    } para revisão manual.`;
  }

  return base;
}
