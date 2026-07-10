import type { Category } from "@/types/category";

export const mockCategories: Category[] = [
  { id: "cat-1", name: "Moradia", type: "expense", color: "#6366f1", icon: null, owner_user_id: null, is_active: true },
  { id: "cat-2", name: "Alimentação", type: "expense", color: "#f97316", icon: null, owner_user_id: null, is_active: true },
  { id: "cat-3", name: "Transporte", type: "expense", color: "#0ea5e9", icon: null, owner_user_id: null, is_active: true },
  { id: "cat-4", name: "Salário", type: "income", color: "#22c55e", icon: null, owner_user_id: null, is_active: true },
  { id: "cat-5", name: "Lazer", type: "expense", color: "#ec4899", icon: null, owner_user_id: null, is_active: true },
];
