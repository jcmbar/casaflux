import { describe, expect, it } from "vitest";

import { upsertCategoryInList } from "@/lib/finance/category-list-utils";
import type { Category } from "@/types/category";

import {
  getImportRowSelectedCategoryId,
  refreshImportRowCategoryLabel,
  syncImportRowsAfterCategorySaved,
} from "./import-category-actions";
import {
  applyConfirmedCategoryToRow,
  mapCategoriesToSuggestionCatalog,
} from "./category-suggestion-service";
import type { ImportPreviewRow } from "../types";

const expenseCategory: Category = {
  id: "cat-expense-1",
  name: "Mercado",
  type: "expense",
  color: null,
  icon: null,
  owner_user_id: "user-1",
  is_active: true,
};

const incomeCategory: Category = {
  id: "cat-income-1",
  name: "Salário",
  type: "income",
  color: null,
  icon: null,
  owner_user_id: "user-1",
  is_active: true,
};

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

describe("import category actions", () => {
  it("selects a newly created category on the current row", () => {
    const rows = [
      buildRow({ sourceLine: 1 }),
      buildRow({ sourceLine: 2, direction: "in", kind: "card_purchase" }),
    ];
    const created: Category = {
      ...expenseCategory,
      id: "cat-new",
      name: "Farmácia",
    };
    const catalog = mapCategoriesToSuggestionCatalog([
      expenseCategory,
      created,
    ]);

    const nextRows = syncImportRowsAfterCategorySaved({
      rows,
      category: created,
      catalog,
      sourceLine: 1,
      mode: "create",
    });

    expect(nextRows[0]?.confirmedCategoryId).toBe("cat-new");
    expect(nextRows[0]?.categorySuggestion?.categoryName).toBe("Farmácia");
    expect(nextRows[1]?.confirmedCategoryId).toBeNull();
  });

  it("makes a new category available to other rows via upsert", () => {
    const created: Category = {
      ...expenseCategory,
      id: "cat-new",
      name: "Farmácia",
    };

    const nextCategories = upsertCategoryInList([expenseCategory], created);

    expect(nextCategories.map((category) => category.id)).toContain(created.id);
    expect(nextCategories).toHaveLength(2);
    expect(
      mapCategoriesToSuggestionCatalog(nextCategories).some(
        (category) => category.id === created.id,
      ),
    ).toBe(true);
  });

  it("reflects an edited category name across rows using that category", () => {
    const rows = [
      applyConfirmedCategoryToRow(
        buildRow({ sourceLine: 1 }),
        expenseCategory.id,
        mapCategoriesToSuggestionCatalog([expenseCategory]),
      ),
      buildRow({
        sourceLine: 2,
        categoryStatus: "suggested",
        categorySuggestion: {
          categoryId: expenseCategory.id,
          categoryName: expenseCategory.name,
          confidence: "high",
          source: "exact_match",
          basedOnCount: 2,
        },
      }),
    ];

    const updated = { ...expenseCategory, name: "Supermercado" };
    const nextRows = syncImportRowsAfterCategorySaved({
      rows,
      category: updated,
      catalog: mapCategoriesToSuggestionCatalog([updated, incomeCategory]),
      sourceLine: 1,
      mode: "update",
    });

    expect(nextRows[0]?.categorySuggestion?.categoryName).toBe("Supermercado");
    expect(nextRows[1]?.categorySuggestion?.categoryName).toBe("Supermercado");
    expect(refreshImportRowCategoryLabel(rows[1]!, updated).categorySuggestion?.categoryName).toBe(
      "Supermercado",
    );
  });

  it("derives the selected category id from confirmed or suggested values", () => {
    expect(getImportRowSelectedCategoryId(buildRow({ sourceLine: 1 }))).toBe("");

    expect(
      getImportRowSelectedCategoryId(
        applyConfirmedCategoryToRow(
          buildRow({ sourceLine: 1 }),
          expenseCategory.id,
          mapCategoriesToSuggestionCatalog([expenseCategory]),
        ),
      ),
    ).toBe(expenseCategory.id);
  });
});
