import { applyConfirmedCategoryToRow } from "./category-suggestion-service";
import {
  resolveImportRowTransactionType,
  type CategorySuggestionCatalogItem,
} from "./category-suggester";
import { isImportRowCategorizable } from "./import-category-review";
import {
  normalizeImportDescription,
  normalizeMerchant,
} from "./normalize-merchant";
import type { ImportPreviewRow } from "../types";

export type ImportCategoryBatchTypeFilter = "all" | "expense" | "income";

export const IMPORT_CATEGORY_BATCH_TYPE_FILTER_LABELS: Record<
  ImportCategoryBatchTypeFilter,
  string
> = {
  all: "Todos",
  expense: "Débitos / Despesas",
  income: "Créditos / Receitas",
};

export function normalizeCategoryFilterKeyword(keyword: string): string {
  return normalizeImportDescription(keyword.trim());
}

export function importRowMatchesCategoryKeyword(
  row: ImportPreviewRow,
  keyword: string,
): boolean {
  const normalizedKeyword = normalizeCategoryFilterKeyword(keyword);
  if (!normalizedKeyword) {
    return true;
  }

  const description = normalizeImportDescription(row.description);
  const merchant =
    row.normalizedMerchant ?? normalizeMerchant(row.description);

  return (
    description.includes(normalizedKeyword) ||
    merchant.includes(normalizedKeyword)
  );
}

export function importRowMatchesBatchTypeFilter(
  row: ImportPreviewRow,
  typeFilter: ImportCategoryBatchTypeFilter = "all",
): boolean {
  if (typeFilter === "all") {
    return true;
  }

  return resolveImportRowTransactionType(row) === typeFilter;
}

export function filterImportRowsByCategoryKeyword(
  rows: ImportPreviewRow[],
  keyword: string,
  options: {
    includeConfirmed?: boolean;
    typeFilter?: ImportCategoryBatchTypeFilter;
  } = {},
): ImportPreviewRow[] {
  const normalizedKeyword = normalizeCategoryFilterKeyword(keyword);
  if (!normalizedKeyword) {
    return [];
  }

  const includeConfirmed = Boolean(options.includeConfirmed);
  const typeFilter = options.typeFilter ?? "all";

  return rows.filter((row) => {
    if (!isImportRowCategorizable(row)) {
      return false;
    }
    if (!includeConfirmed && row.categoryStatus === "confirmed") {
      return false;
    }
    if (!importRowMatchesBatchTypeFilter(row, typeFilter)) {
      return false;
    }
    return importRowMatchesCategoryKeyword(row, normalizedKeyword);
  });
}

export function resolveBatchApplyTargetLines(input: {
  filteredRows: ImportPreviewRow[];
  selectedSourceLines: readonly number[];
  scope: "selected" | "filtered";
  includeConfirmed: boolean;
}): number[] {
  const baseRows =
    input.scope === "selected"
      ? input.filteredRows.filter((row) =>
          input.selectedSourceLines.includes(row.sourceLine),
        )
      : input.filteredRows;

  return baseRows
    .filter((row) => {
      if (!isImportRowCategorizable(row)) {
        return false;
      }
      if (!input.includeConfirmed && row.categoryStatus === "confirmed") {
        return false;
      }
      return true;
    })
    .map((row) => row.sourceLine);
}

export function countConfirmedInBatchTargets(
  rows: ImportPreviewRow[],
  targetLines: readonly number[],
): number {
  const targets = new Set(targetLines);
  return rows.filter(
    (row) => targets.has(row.sourceLine) && row.categoryStatus === "confirmed",
  ).length;
}

export function applyCategoryToImportRowsBatch(input: {
  rows: ImportPreviewRow[];
  sourceLines: readonly number[];
  categoryId: string;
  catalog: CategorySuggestionCatalogItem[];
  includeConfirmed?: boolean;
}): {
  rows: ImportPreviewRow[];
  appliedLines: number[];
  skippedConfirmedLines: number[];
  skippedTypeMismatchLines: number[];
} {
  const targets = new Set(input.sourceLines);
  const appliedLines: number[] = [];
  const skippedConfirmedLines: number[] = [];
  const skippedTypeMismatchLines: number[] = [];
  const includeConfirmed = Boolean(input.includeConfirmed);
  const category = input.catalog.find((item) => item.id === input.categoryId);

  const nextRows = input.rows.map((row) => {
    if (!targets.has(row.sourceLine) || !isImportRowCategorizable(row)) {
      return row;
    }

    if (row.categoryStatus === "confirmed" && !includeConfirmed) {
      skippedConfirmedLines.push(row.sourceLine);
      return row;
    }

    if (category && resolveImportRowTransactionType(row) !== category.type) {
      skippedTypeMismatchLines.push(row.sourceLine);
      return row;
    }

    appliedLines.push(row.sourceLine);
    return applyConfirmedCategoryToRow(row, input.categoryId, input.catalog);
  });

  return {
    rows: nextRows,
    appliedLines,
    skippedConfirmedLines,
    skippedTypeMismatchLines,
  };
}

export function formatBatchCategoryApplyMessage(input: {
  categoryName: string;
  appliedCount: number;
  skippedConfirmedCount: number;
}): string {
  const parts = [
    `${input.appliedCount} lançamento(s) receberão a categoria "${input.categoryName}".`,
  ];

  if (input.skippedConfirmedCount > 0) {
    parts.push(
      `${input.skippedConfirmedCount} já confirmado(s) serão mantidos.`,
    );
  }

  return parts.join(" ");
}
