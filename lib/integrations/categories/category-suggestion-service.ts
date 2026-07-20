import type { SupabaseClient } from "@supabase/supabase-js";

import type { TransactionType } from "@/types/transaction";
import type { Category } from "@/types/category";
import type { ImportCategoryStatus, ImportPreview, ImportPreviewRow } from "../types";
import { shouldAutoConfirmConfidence } from "./category-confidence";
import {
  buildCategoryHistoryIndex,
  suggestCategoryForImportRow,
  type CategoryHistoryTransaction,
  type CategorySuggestionCatalogItem,
} from "./category-suggester";
import { normalizeImportText } from "./normalize-merchant";

export function mapCategoriesToSuggestionCatalog(
  categories: Array<Pick<Category, "id" | "name" | "type">>,
): CategorySuggestionCatalogItem[] {
  return categories
    .filter((category) => category.type === "income" || category.type === "expense")
    .map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type as TransactionType,
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

  const suggestedCount = rows.filter((row) => row.categoryStatus === "suggested").length;
  const highConfidenceCount = rows.filter(
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
      withoutCategoryCount: rows.filter((row) => row.categoryStatus === "none").length,
    },
  };
}

export function applyConfirmedCategoryToRow(
  row: ImportPreviewRow,
  categoryId: string | null,
  categories: CategorySuggestionCatalogItem[],
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

  return {
    ...row,
    categoryStatus: "confirmed",
    confirmedCategoryId: categoryId,
    categorySuggestion: {
      categoryId: category.id,
      categoryName: category.name,
      confidence: row.categorySuggestion?.confidence ?? "medium",
      source: row.categorySuggestion?.source ?? "exact_match",
      basedOnCount: row.categorySuggestion?.basedOnCount ?? 1,
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
): Promise<CategoryHistoryTransaction[]> {
  if (accountIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("description, type, category_id, categories ( id, name )")
    .in("account_id", accountIds)
    .not("category_id", "is", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as Array<{
    description: string;
    type: TransactionType;
    category_id: string;
    categories: { id: string; name: string } | { id: string; name: string }[] | null;
  }>;

  return rows.flatMap((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
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

export function summarizeCategoryStates(rows: ImportPreviewRow[]) {
  return {
    suggestedCount: rows.filter((row) => row.categoryStatus === "suggested").length,
    highConfidenceCount: rows.filter(
      (row) => row.categorySuggestion?.confidence === "high",
    ).length,
    confirmedCount: rows.filter((row) => row.categoryStatus === "confirmed").length,
    withoutCategoryCount: rows.filter((row) => row.categoryStatus === "none").length,
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
