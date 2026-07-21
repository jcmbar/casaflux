import type { Category } from "@/types/category";

import type { ImportPreviewRow } from "../types";
import { applyConfirmedCategoryToRow } from "./category-suggestion-service";
import type { CategorySuggestionCatalogItem } from "./category-suggester";

export function refreshImportRowCategoryLabel(
  row: ImportPreviewRow,
  category: Pick<Category, "id" | "name">,
): ImportPreviewRow {
  if (row.confirmedCategoryId === category.id && row.categorySuggestion) {
    return {
      ...row,
      categorySuggestion: {
        ...row.categorySuggestion,
        categoryName: category.name,
      },
    };
  }

  if (row.categorySuggestion?.categoryId === category.id) {
    return {
      ...row,
      categorySuggestion: {
        ...row.categorySuggestion,
        categoryName: category.name,
      },
    };
  }

  return row;
}

export function syncImportRowsAfterCategorySaved(input: {
  rows: ImportPreviewRow[];
  category: Pick<Category, "id" | "name" | "type">;
  catalog: CategorySuggestionCatalogItem[];
  sourceLine: number;
  mode: "create" | "update";
}): ImportPreviewRow[] {
  return input.rows.map((row) => {
    let nextRow = refreshImportRowCategoryLabel(row, input.category);

    if (input.mode === "create" && row.sourceLine === input.sourceLine) {
      nextRow = applyConfirmedCategoryToRow(
        nextRow,
        input.category.id,
        input.catalog,
      );
    }

    return nextRow;
  });
}

export function getImportRowSelectedCategoryId(row: ImportPreviewRow): string {
  return row.confirmedCategoryId ?? row.categorySuggestion?.categoryId ?? "";
}
