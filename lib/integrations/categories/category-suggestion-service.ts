import type { SupabaseClient } from "@supabase/supabase-js";

import type { TransactionType } from "@/types/transaction";
import type { Category } from "@/types/category";
import type { ImportCategoryStatus, ImportPreview, ImportPreviewRow } from "../types";
import { shouldAutoConfirmConfidence } from "./category-confidence";
import {
  fetchCategoryClassificationMemory,
  mergeCategoryHistorySources,
} from "./category-classification-memory";
import {
  buildCategoryHistoryIndex,
  suggestCategoryForImportRow,
  type CategoryHistoryTransaction,
  type CategorySuggestionCatalogItem,
} from "./category-suggester";
import { isImportRowCategorizable } from "./import-category-review";
import { normalizeImportText } from "./normalize-merchant";

export function mapCategoriesToSuggestionCatalog(
  categories: Array<Pick<Category, "id" | "name" | "type">>,
  keywordsByCategoryId?: ReadonlyMap<string, string[]>,
): CategorySuggestionCatalogItem[] {
  return categories
    .filter((category) => category.type === "income" || category.type === "expense")
    .map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type as TransactionType,
      keywords: keywordsByCategoryId?.get(category.id) ?? [],
    }));
}

export function enrichImportRowWithCategorySuggestion(
  row: ImportPreviewRow,
  index: ReturnType<typeof buildCategoryHistoryIndex>,
  categories: CategorySuggestionCatalogItem[],
): ImportPreviewRow {
  const normalized = normalizeImportText(row.description);
  const categorySuggestion = suggestCategoryForImportRow(row, index, categories);

  return {
    ...row,
    normalizedDescription: normalized.normalizedDescription,
    normalizedMerchant: normalized.normalizedMerchant,
    categorySuggestion: categorySuggestion ?? undefined,
    categoryStatus: categorySuggestion ? "suggested" : "none",
    confirmedCategoryId: null,
  };
}

export function enrichPreviewWithCategorySuggestions(
  preview: ImportPreview,
  history: CategoryHistoryTransaction[],
  categories: CategorySuggestionCatalogItem[],
): ImportPreview {
  const index = buildCategoryHistoryIndex(history);
  const rows = preview.rows.map((row) =>
    enrichImportRowWithCategorySuggestion(row, index, categories),
  );

  const categorizableRows = rows.filter(isImportRowCategorizable);
  const suggestedCount = categorizableRows.filter(
    (row) => row.categoryStatus === "suggested",
  ).length;
  const highConfidenceCount = categorizableRows.filter(
    (row) => row.categorySuggestion?.confidence === "high",
  ).length;

  return {
    ...preview,
    rows,
    needsReview: preview.needsReview,
    categorySummary: {
      suggestedCount,
      highConfidenceCount,
      confirmedCount: 0,
      withoutCategoryCount: categorizableRows.filter(
        (row) => row.categoryStatus === "none",
      ).length,
    },
  };
}

export function applyConfirmedCategoryToRow(
  row: ImportPreviewRow,
  categoryId: string | null,
  categories: CategorySuggestionCatalogItem[],
  options?: {
    /** Mark this confirmation as propagated from another reviewed line. */
    propagatedFromSourceLine?: number;
  },
): ImportPreviewRow {
  if (!categoryId) {
    return {
      ...row,
      categoryStatus: "none",
      confirmedCategoryId: null,
    };
  }

  const category = categories.find((item) => item.id === categoryId);
  if (!category) {
    return row;
  }

  const propagatedFromSourceLine = options?.propagatedFromSourceLine;
  const isPropagated =
    propagatedFromSourceLine != null &&
    propagatedFromSourceLine !== row.sourceLine;

  const previousSource = row.categorySuggestion?.source;
  const source = isPropagated
    ? "propagated"
    : previousSource === "propagated"
      ? "exact_match"
      : (previousSource ?? "exact_match");

  return {
    ...row,
    categoryStatus: "confirmed",
    confirmedCategoryId: categoryId,
    categorySuggestion: {
      categoryId: category.id,
      categoryName: category.name,
      confidence: row.categorySuggestion?.confidence ?? "medium",
      source,
      basedOnCount: row.categorySuggestion?.basedOnCount ?? 1,
      matchedKeyword:
        !isPropagated && source === "category_keyword"
          ? row.categorySuggestion?.matchedKeyword
          : undefined,
      propagatedFromSourceLine: isPropagated
        ? propagatedFromSourceLine
        : undefined,
    },
  };
}

export function applyHighConfidenceCategorySuggestions(
  rows: ImportPreviewRow[],
  categories: CategorySuggestionCatalogItem[],
): ImportPreviewRow[] {
  return rows.map((row) => {
    if (
      !row.categorySuggestion ||
      !shouldAutoConfirmConfidence(row.categorySuggestion.confidence)
    ) {
      return row;
    }

    return applyConfirmedCategoryToRow(
      row,
      row.categorySuggestion.categoryId,
      categories,
    );
  });
}

export function getConfirmedCategoryForCommit(row: ImportPreviewRow): string | null {
  if (row.categoryStatus === "confirmed" && row.confirmedCategoryId) {
    return row.confirmedCategoryId;
  }

  return null;
}

export async function fetchCategoryHistoryTransactions(
  supabase: SupabaseClient,
  accountIds: string[],
  limit = 500,
  ownerUserId?: string | null,
): Promise<CategoryHistoryTransaction[]> {
  const liveLimit = Math.max(1, Math.floor(limit * 0.7));
  const memoryLimit = Math.max(1, limit - liveLimit);

  let live: CategoryHistoryTransaction[] = [];

  if (accountIds.length > 0) {
    const { data, error } = await supabase
      .from("transactions")
      .select("description, type, category_id, categories ( id, name )")
      .in("account_id", accountIds)
      .not("category_id", "is", null)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(liveLimit);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as unknown as Array<{
      description: string;
      type: TransactionType;
      category_id: string;
      categories: { id: string; name: string } | { id: string; name: string }[] | null;
    }>;

    live = rows.flatMap((row) => {
      const category = Array.isArray(row.categories)
        ? row.categories[0]
        : row.categories;
      if (!category) {
        return [];
      }

      return [
        {
          description: row.description,
          type: row.type,
          categoryId: row.category_id,
          categoryName: category.name,
        },
      ];
    });
  }

  let memory: CategoryHistoryTransaction[] = [];
  if (ownerUserId) {
    memory = await fetchCategoryClassificationMemory(
      supabase,
      ownerUserId,
      memoryLimit,
    );
    return mergeCategoryHistorySources(live, memory, limit);
  }

  return live.slice(0, limit);
}

export function summarizeCategoryStates(rows: ImportPreviewRow[]) {
  const categorizableRows = rows.filter(isImportRowCategorizable);

  return {
    suggestedCount: categorizableRows.filter(
      (row) => row.categoryStatus === "suggested",
    ).length,
    highConfidenceCount: categorizableRows.filter(
      (row) => row.categorySuggestion?.confidence === "high",
    ).length,
    confirmedCount: categorizableRows.filter(
      (row) => row.categoryStatus === "confirmed",
    ).length,
    withoutCategoryCount: categorizableRows.filter(
      (row) => row.categoryStatus === "none",
    ).length,
  };
}

export function withCategorySummary(
  preview: ImportPreview,
  rows: ImportPreviewRow[],
): ImportPreview {
  return {
    ...preview,
    rows,
    categorySummary: summarizeCategoryStates(rows),
  };
}

export function resolveImportCategoryStatusLabel(status: ImportCategoryStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmada";
    case "suggested":
      return "Sugerida";
    default:
      return "Sem categoria";
  }
}
