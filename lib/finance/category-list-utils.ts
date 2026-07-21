import type { Category } from "@/types/category";

export function sortCategoriesByName(categories: Category[]): Category[] {
  return [...categories].sort((left, right) =>
    left.name.localeCompare(right.name, "pt-BR"),
  );
}

export function upsertCategoryInList(
  categories: Category[],
  category: Category,
): Category[] {
  const withoutExisting = categories.filter((item) => item.id !== category.id);
  return sortCategoriesByName([...withoutExisting, category]);
}
