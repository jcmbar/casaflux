import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category } from "@/types/category";
import { isCustomCategory, isSystemCategory } from "@/types/category";

export type CategoryVisibilityFields = Pick<
  Category,
  "id" | "owner_user_id" | "is_active"
>;

export type CategoryVisibilityContext = {
  hiddenSystemCategoryIds: Set<string>;
};

export function buildHiddenSystemCategoryIds(
  rows: Array<{ category_id: string }>,
): Set<string> {
  return new Set(rows.map((row) => row.category_id));
}

export function isCategoryActiveForUser(
  category: CategoryVisibilityFields,
  context: CategoryVisibilityContext,
): boolean {
  if (isCustomCategory(category)) {
    return category.is_active;
  }

  if (isSystemCategory(category)) {
    return !context.hiddenSystemCategoryIds.has(category.id);
  }

  return true;
}

export function isCategoryInactiveForUser(
  category: CategoryVisibilityFields,
  context: CategoryVisibilityContext,
): boolean {
  return !isCategoryActiveForUser(category, context);
}

export function filterActiveCategories<T extends CategoryVisibilityFields>(
  categories: T[],
  context: CategoryVisibilityContext,
): T[] {
  return categories.filter((category) =>
    isCategoryActiveForUser(category, context),
  );
}

export function getSelectableCategories<T extends CategoryVisibilityFields>(
  categories: T[],
  context: CategoryVisibilityContext,
  options?: { includeCategoryId?: string | null },
): T[] {
  const active = filterActiveCategories(categories, context);
  const includeId = options?.includeCategoryId;

  if (!includeId || active.some((category) => category.id === includeId)) {
    return active;
  }

  const extra = categories.find((category) => category.id === includeId);
  return extra ? [...active, extra] : active;
}

export function splitCategoriesByVisibility<T extends Category>(
  categories: T[],
  context: CategoryVisibilityContext,
) {
  const active: T[] = [];
  const inactive: T[] = [];

  for (const category of categories) {
    if (isCategoryActiveForUser(category, context)) {
      active.push(category);
    } else {
      inactive.push(category);
    }
  }

  return { active, inactive };
}

export async function fetchHiddenSystemCategoryIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_hidden_categories")
    .select("category_id")
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    return new Set();
  }

  return buildHiddenSystemCategoryIds(data ?? []);
}

export async function fetchCategoryVisibilityContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<CategoryVisibilityContext> {
  const hiddenSystemCategoryIds = await fetchHiddenSystemCategoryIds(
    supabase,
    userId,
  );

  return { hiddenSystemCategoryIds };
}

export type CategoryUsage = {
  transactionCount: number;
  budgetCount: number;
  inUse: boolean;
};

export async function fetchCategoryUsage(
  supabase: SupabaseClient,
  categoryId: string,
): Promise<CategoryUsage> {
  const [transactionsRes, budgetsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId),
    supabase
      .from("category_budgets")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId),
  ]);

  if (transactionsRes.error) {
    console.error(transactionsRes.error);
  }

  if (budgetsRes.error) {
    console.error(budgetsRes.error);
  }

  const transactionCount = transactionsRes.count ?? 0;
  const budgetCount = budgetsRes.count ?? 0;

  return {
    transactionCount,
    budgetCount,
    inUse: transactionCount > 0 || budgetCount > 0,
  };
}

export const CATEGORY_IN_USE_MESSAGE =
  "Essa categoria já foi usada em lançamentos. Você pode desativá-la, mas não excluí-la.";

export async function deactivateCategoryForUser(
  supabase: SupabaseClient,
  category: Pick<Category, "id" | "owner_user_id">,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isCustomCategory(category)) {
    const { error } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("id", category.id);

    if (error) {
      console.error(error);
      return { ok: false, message: "Não foi possível desativar a categoria." };
    }

    return { ok: true };
  }

  const { error } = await supabase.from("user_hidden_categories").insert({
    user_id: userId,
    category_id: category.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true };
    }

    console.error(error);
    return { ok: false, message: "Não foi possível desativar a categoria." };
  }

  return { ok: true };
}

export async function reactivateCategoryForUser(
  supabase: SupabaseClient,
  category: Pick<Category, "id" | "owner_user_id">,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isCustomCategory(category)) {
    const { error } = await supabase
      .from("categories")
      .update({ is_active: true })
      .eq("id", category.id);

    if (error) {
      console.error(error);
      return { ok: false, message: "Não foi possível reativar a categoria." };
    }

    return { ok: true };
  }

  const { error } = await supabase
    .from("user_hidden_categories")
    .delete()
    .eq("user_id", userId)
    .eq("category_id", category.id);

  if (error) {
    console.error(error);
    return { ok: false, message: "Não foi possível reativar a categoria." };
  }

  return { ok: true };
}

export async function deleteUnusedCustomCategory(
  supabase: SupabaseClient,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; message: string; inUse?: boolean }> {
  const usage = await fetchCategoryUsage(supabase, categoryId);

  if (usage.inUse) {
    return {
      ok: false,
      inUse: true,
      message: CATEGORY_IN_USE_MESSAGE,
    };
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    console.error(error);
    return { ok: false, message: "Não foi possível excluir a categoria." };
  }

  return { ok: true };
}
