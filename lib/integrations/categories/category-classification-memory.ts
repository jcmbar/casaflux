import type { SupabaseClient } from "@supabase/supabase-js";

import type { TransactionType } from "@/types/transaction";
import type { CategoryHistoryTransaction } from "./category-suggester";

export type CategoryClassificationMemoryRow = {
  description: string;
  transaction_type: TransactionType;
  category_id: string;
  hit_count: number;
  categories: { id: string; name: string } | { id: string; name: string }[] | null;
};

const MAX_EXPANDED_HITS_PER_SAMPLE = 25;

export function expandClassificationMemoryToHistory(
  rows: CategoryClassificationMemoryRow[],
): CategoryHistoryTransaction[] {
  const history: CategoryHistoryTransaction[] = [];

  for (const row of rows) {
    const category = Array.isArray(row.categories)
      ? row.categories[0]
      : row.categories;
    if (!category) {
      continue;
    }

    if (row.transaction_type !== "income" && row.transaction_type !== "expense") {
      continue;
    }

    const repeats = Math.min(
      Math.max(1, Number(row.hit_count) || 1),
      MAX_EXPANDED_HITS_PER_SAMPLE,
    );

    for (let index = 0; index < repeats; index += 1) {
      history.push({
        description: row.description,
        type: row.transaction_type,
        categoryId: row.category_id,
        categoryName: category.name,
      });
    }
  }

  return history;
}

export function mergeCategoryHistorySources(
  liveTransactions: CategoryHistoryTransaction[],
  memorySamples: CategoryHistoryTransaction[],
  limit: number,
): CategoryHistoryTransaction[] {
  // Prefer recent live transactions, then durable memory for continuity after wipes.
  return [...liveTransactions, ...memorySamples].slice(0, limit);
}

export async function fetchCategoryClassificationMemory(
  supabase: SupabaseClient,
  ownerUserId: string,
  limit = 500,
): Promise<CategoryHistoryTransaction[]> {
  if (!ownerUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from("category_classification_memory")
    .select(
      "description, transaction_type, category_id, hit_count, categories ( id, name )",
    )
    .eq("owner_user_id", ownerUserId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return expandClassificationMemoryToHistory(
    (data ?? []) as unknown as CategoryClassificationMemoryRow[],
  );
}
