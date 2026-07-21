import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category, CategoryType } from "@/types/category";

export type SaveUserCategoryInput = {
  name: string;
  type: CategoryType;
  ownerUserId: string;
};

export type UpdateUserCategoryInput = {
  categoryId: string;
  name: string;
  type: CategoryType;
};

export async function createUserCategory(
  supabase: SupabaseClient,
  input: SaveUserCategoryInput,
): Promise<{ category: Category | null; errorMessage: string | null }> {
  const name = input.name.trim();
  if (!name) {
    return { category: null, errorMessage: "Informe o nome da categoria." };
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name,
      type: input.type,
      owner_user_id: input.ownerUserId,
      is_active: true,
    })
    .select("id, name, type, color, icon, owner_user_id, is_active, created_at")
    .single();

  if (error || !data) {
    return {
      category: null,
      errorMessage: error?.message ?? "Não foi possível criar a categoria.",
    };
  }

  return {
    category: {
      ...(data as Category),
      is_active: (data as Category).is_active ?? true,
    },
    errorMessage: null,
  };
}

export async function updateUserCategory(
  supabase: SupabaseClient,
  input: UpdateUserCategoryInput,
): Promise<{ category: Category | null; errorMessage: string | null }> {
  const name = input.name.trim();
  if (!name) {
    return { category: null, errorMessage: "Informe o nome da categoria." };
  }

  const { data, error } = await supabase
    .from("categories")
    .update({ name, type: input.type })
    .eq("id", input.categoryId)
    .select("id, name, type, color, icon, owner_user_id, is_active, created_at")
    .single();

  if (error || !data) {
    return {
      category: null,
      errorMessage: error?.message ?? "Não foi possível atualizar a categoria.",
    };
  }

  return {
    category: {
      ...(data as Category),
      is_active: (data as Category).is_active ?? true,
    },
    errorMessage: null,
  };
}
