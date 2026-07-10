import { describe, expect, it } from "vitest";

import {
  filterActiveCategories,
  getSelectableCategories,
  isCategoryActiveForUser,
  splitCategoriesByVisibility,
} from "./active-categories";
import type { Category } from "@/types/category";

function category(
  overrides: Partial<Category> & Pick<Category, "id" | "name" | "type">,
): Category {
  return {
    color: null,
    icon: null,
    owner_user_id: null,
    is_active: true,
    ...overrides,
  };
}

describe("active-categories", () => {
  it("treats inactive personal categories as hidden", () => {
    const personal = category({
      id: "1",
      name: "Mercado",
      type: "expense",
      owner_user_id: "user-1",
      is_active: false,
    });

    expect(
      isCategoryActiveForUser(personal, { hiddenSystemCategoryIds: new Set() }),
    ).toBe(false);
  });

  it("treats hidden system categories as inactive for the user", () => {
    const system = category({
      id: "2",
      name: "Lazer",
      type: "expense",
      owner_user_id: null,
    });

    expect(
      isCategoryActiveForUser(system, {
        hiddenSystemCategoryIds: new Set(["2"]),
      }),
    ).toBe(false);
  });

  it("splits active and inactive categories", () => {
    const categories = [
      category({ id: "1", name: "A", type: "expense", owner_user_id: null }),
      category({
        id: "2",
        name: "B",
        type: "expense",
        owner_user_id: "user-1",
        is_active: false,
      }),
    ];

    const split = splitCategoriesByVisibility(categories, {
      hiddenSystemCategoryIds: new Set(),
    });

    expect(split.active).toHaveLength(1);
    expect(split.inactive).toHaveLength(1);
  });

  it("includes inactive selected category in selectable list", () => {
    const categories = [
      category({ id: "1", name: "Ativa", type: "expense", owner_user_id: null }),
      category({
        id: "2",
        name: "Inativa",
        type: "expense",
        owner_user_id: "user-1",
        is_active: false,
      }),
    ];

    const selectable = getSelectableCategories(
      categories,
      { hiddenSystemCategoryIds: new Set() },
      { includeCategoryId: "2" },
    );

    expect(selectable.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("filters active categories for selectors", () => {
    const categories = [
      category({ id: "1", name: "Ativa", type: "expense", owner_user_id: null }),
      category({
        id: "2",
        name: "Inativa",
        type: "expense",
        owner_user_id: null,
      }),
    ];

    const active = filterActiveCategories(categories, {
      hiddenSystemCategoryIds: new Set(["2"]),
    });

    expect(active.map((item) => item.id)).toEqual(["1"]);
  });
});
