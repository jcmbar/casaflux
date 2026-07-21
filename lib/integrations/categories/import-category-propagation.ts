import { shouldAutoConfirmConfidence } from "./category-confidence";
import {
  applyConfirmedCategoryToRow,
  applyHighConfidenceCategorySuggestions,
  type CategorySuggestionCatalogItem,
} from "./category-suggestion-service";
import { resolveImportRowTransactionType } from "./category-suggester";
import type { ImportCategoryReviewMode } from "./import-category-review";
import { isImportCategoryReviewPending, isImportRowCategorizable } from "./import-category-review";
import {
  normalizeImportDescription,
  normalizeMerchant,
} from "./normalize-merchant";
import type { ImportPreviewRow } from "../types";

export type ImportCategoryGroupKind = "strong_prefix" | "exact_merchant";

export type ImportCategoryGroup = {
  key: string;
  kind: ImportCategoryGroupKind;
  label: string;
};

export type ImportCategoryPropagationOffer = {
  sourceLine: number;
  categoryId: string;
  categoryName: string;
  group: ImportCategoryGroup;
  similarLines: number[];
};

export function detectStrongMerchantPrefix(description: string): string | null {
  const normalized = normalizeImportDescription(description);
  const attachedMatch = normalized.match(/^([a-z]{2,})\*/);
  if (attachedMatch?.[1]) {
    return attachedMatch[1];
  }

  const spacedMatch = normalized.match(/\b([a-z]{2,})\s+\*/);
  if (spacedMatch?.[1]) {
    return spacedMatch[1];
  }

  return null;
}

export function buildImportCategoryGroup(row: ImportPreviewRow): ImportCategoryGroup | null {
  if (!isImportRowCategorizable(row)) {
    return null;
  }

  const transactionType = resolveImportRowTransactionType(row);
  const normalizedMerchant =
    row.normalizedMerchant ?? normalizeMerchant(row.description);
  const strongPrefix = detectStrongMerchantPrefix(row.description);

  if (strongPrefix) {
    return {
      key: `${transactionType}:strong:${strongPrefix}`,
      kind: "strong_prefix",
      label: strongPrefix,
    };
  }

  if (normalizedMerchant.length >= 4) {
    return {
      key: `${transactionType}:merchant:${normalizedMerchant}`,
      kind: "exact_merchant",
      label: normalizedMerchant,
    };
  }

  return null;
}

export function buildImportCategoryGroups(
  rows: ImportPreviewRow[],
): Map<string, ImportPreviewRow[]> {
  const groups = new Map<string, ImportPreviewRow[]>();

  for (const row of rows) {
    const group = buildImportCategoryGroup(row);
    if (!group) {
      continue;
    }

    const current = groups.get(group.key) ?? [];
    current.push(row);
    groups.set(group.key, current);
  }

  return groups;
}

export function getSimilarUncategorizedLines(
  rows: ImportPreviewRow[],
  sourceLine: number,
): ImportPreviewRow[] {
  const sourceRow = rows.find((row) => row.sourceLine === sourceLine);
  if (!sourceRow) {
    return [];
  }

  const group = buildImportCategoryGroup(sourceRow);
  if (!group) {
    return [];
  }

  return rows.filter(
    (row) =>
      row.sourceLine !== sourceLine &&
      isImportCategoryReviewPending(row) &&
      buildImportCategoryGroup(row)?.key === group.key,
  );
}

export function resolveGroupPropagationConfidence(
  group: ImportCategoryGroup,
  sourceRow: ImportPreviewRow,
): "high" | "medium" | "low" | null {
  if (group.kind === "strong_prefix") {
    return "high";
  }

  if (
    sourceRow.categorySuggestion &&
    shouldAutoConfirmConfidence(sourceRow.categorySuggestion.confidence)
  ) {
    return "high";
  }

  if (sourceRow.categorySuggestion?.confidence === "medium") {
    return "medium";
  }

  if (sourceRow.categorySuggestion?.confidence === "low") {
    return "low";
  }

  return null;
}

export function shouldAutoPropagateCategory(
  mode: ImportCategoryReviewMode,
  confidence: "high" | "medium" | "low" | null,
): boolean {
  return mode === "automatic" && confidence === "high";
}

export function buildImportCategoryPropagationOffer(input: {
  rows: ImportPreviewRow[];
  sourceLine: number;
  categoryId: string;
  catalog: CategorySuggestionCatalogItem[];
}): ImportCategoryPropagationOffer | null {
  const sourceRow = input.rows.find((row) => row.sourceLine === input.sourceLine);
  if (!sourceRow) {
    return null;
  }

  const group = buildImportCategoryGroup(sourceRow);
  if (!group) {
    return null;
  }

  const similarRows = getSimilarUncategorizedLines(input.rows, input.sourceLine);
  if (similarRows.length === 0) {
    return null;
  }

  const categoryName =
    input.catalog.find((category) => category.id === input.categoryId)?.name ??
    sourceRow.categorySuggestion?.categoryName ??
    "";

  return {
    sourceLine: input.sourceLine,
    categoryId: input.categoryId,
    categoryName,
    group,
    similarLines: similarRows.map((row) => row.sourceLine),
  };
}

export function formatImportCategoryPropagationLabel(count: number): string {
  if (count <= 0) {
    return "";
  }

  if (count === 1) {
    return "Aplicar também a 1 semelhante";
  }

  return `Aplicar também a ${count} semelhantes`;
}

export function applyCategoryPropagation(input: {
  rows: ImportPreviewRow[];
  sourceLine: number;
  categoryId: string;
  catalog: CategorySuggestionCatalogItem[];
  mode: ImportCategoryReviewMode;
  forcePropagate?: boolean;
}): {
  rows: ImportPreviewRow[];
  propagatedLines: number[];
  offer: ImportCategoryPropagationOffer | null;
  autoPropagated: boolean;
} {
  const sourceRow = input.rows.find((row) => row.sourceLine === input.sourceLine);
  if (!sourceRow) {
    return {
      rows: input.rows,
      propagatedLines: [],
      offer: null,
      autoPropagated: false,
    };
  }

  let nextRows = input.rows.map((row) =>
    row.sourceLine === input.sourceLine
      ? applyConfirmedCategoryToRow(row, input.categoryId, input.catalog)
      : row,
  );

  const group = buildImportCategoryGroup(sourceRow);
  if (!group) {
    return {
      rows: nextRows,
      propagatedLines: [],
      offer: null,
      autoPropagated: false,
    };
  }

  const similarRows = getSimilarUncategorizedLines(nextRows, input.sourceLine);
  if (similarRows.length === 0) {
    return {
      rows: nextRows,
      propagatedLines: [],
      offer: null,
      autoPropagated: false,
    };
  }

  const confirmedSourceRow =
    nextRows.find((row) => row.sourceLine === input.sourceLine) ?? sourceRow;
  const confidence = resolveGroupPropagationConfidence(group, confirmedSourceRow);
  const offer = buildImportCategoryPropagationOffer({
    rows: nextRows,
    sourceLine: input.sourceLine,
    categoryId: input.categoryId,
    catalog: input.catalog,
  });

  if (input.mode === "manual") {
    return {
      rows: nextRows,
      propagatedLines: [],
      offer,
      autoPropagated: false,
    };
  }

  const shouldPropagate =
    input.forcePropagate ||
    shouldAutoPropagateCategory(input.mode, confidence);

  if (!shouldPropagate) {
    return {
      rows: nextRows,
      propagatedLines: [],
      offer,
      autoPropagated: false,
    };
  }

  const targetLines = new Set(similarRows.map((row) => row.sourceLine));
  nextRows = nextRows.map((row) =>
    targetLines.has(row.sourceLine)
      ? applyConfirmedCategoryToRow(row, input.categoryId, input.catalog)
      : row,
  );

  return {
    rows: nextRows,
    propagatedLines: similarRows.map((row) => row.sourceLine),
    offer: null,
    autoPropagated: true,
  };
}

export function applyHighConfidenceWithPropagation(
  rows: ImportPreviewRow[],
  catalog: CategorySuggestionCatalogItem[],
  mode: ImportCategoryReviewMode,
): ImportPreviewRow[] {
  let nextRows = applyHighConfidenceCategorySuggestions(rows, catalog);

  if (mode !== "automatic") {
    return nextRows;
  }

  const autoConfirmedLines = nextRows
    .filter(
      (row) =>
        row.categoryStatus === "confirmed" &&
        row.confirmedCategoryId &&
        row.categorySuggestion &&
        shouldAutoConfirmConfidence(row.categorySuggestion.confidence),
    )
    .map((row) => row.sourceLine);

  for (const sourceLine of autoConfirmedLines) {
    const row = nextRows.find((item) => item.sourceLine === sourceLine);
    if (!row?.confirmedCategoryId) {
      continue;
    }

    nextRows = applyCategoryPropagation({
      rows: nextRows,
      sourceLine,
      categoryId: row.confirmedCategoryId,
      catalog,
      mode,
    }).rows;
  }

  return nextRows;
}
