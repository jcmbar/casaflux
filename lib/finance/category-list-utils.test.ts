import { describe, expect, it } from "vitest";

import { sortCategoriesByName, upsertCategoryInList } from "./category-list-utils";
import type { Category } from "@/types/category";

const categories: Category[] = [
  {
    id: "b",
    name: "Zebra",
    type: "expense",
    color: null,
    icon: null,
    owner_user_id: "user-1",
    is_active: true,
  },
  {
    id: "a",
    name: "Alimentação",
    type: "expense",
    color: null,
    icon: null,
    owner_user_id: "user-1",
    is_active: true,
  },
];

describe("category list utils", () => {
  it("sorts categories by name in pt-BR locale", () => {
    expect(sortCategoriesByName(categories).map((category) => category.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("upserts a category without duplicates", () => {
    const updated = { ...categories[0]!, name: "Mercado" };
    const next = upsertCategoryInList(categories, updated);

    expect(next).toHaveLength(2);
    expect(next.find((category) => category.id === "b")?.name).toBe("Mercado");
  });
});
