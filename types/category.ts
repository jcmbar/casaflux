export type CategoryType = "income" | "expense" | "transfer";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
  owner_user_id: string | null;
  is_active: boolean;
  created_at?: string;
}

export type UserHiddenCategory = {
  user_id: string;
  category_id: string;
  hidden_at: string;
};

export function isCustomCategory(
  category: Pick<Category, "owner_user_id">,
): boolean {
  return category.owner_user_id !== null;
}

export function isSystemCategory(
  category: Pick<Category, "owner_user_id">,
): boolean {
  return category.owner_user_id === null;
}
