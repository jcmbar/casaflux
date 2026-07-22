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

/**
 * Conflict key for category_classification_memory upserts
 * (matches unique index category_classification_memory_uidx).
 */
export type ClassificationMemoryConflictKey = {
  ownerUserId: string;
  normalizedDescription: string;
  transactionType: "income" | "expense";
  categoryId: string;
};

export type ClassificationMemorySnapshotCandidate = ClassificationMemoryConflictKey & {
  description: string;
  familyId: string | null;
  seenAt: string;
};

export type ClassificationMemorySnapshotRow = ClassificationMemoryConflictKey & {
  description: string;
  familyId: string | null;
  hitCount: number;
  lastSeenAt: string;
};

export function classificationMemoryConflictKey(
  row: ClassificationMemoryConflictKey,
): string {
  return [
    row.ownerUserId,
    row.normalizedDescription,
    row.transactionType,
    row.categoryId,
  ].join("\u0000");
}

/**
 * Collapses raw snapshot candidates to at most one row per ON CONFLICT key.
 * Mirrors snapshot_category_classification_memory: sum hits, keep newest
 * description, prefer non-null family_id.
 */
export function collapseClassificationMemorySnapshotCandidates(
  candidates: readonly ClassificationMemorySnapshotCandidate[],
): ClassificationMemorySnapshotRow[] {
  const byKey = new Map<
    string,
    ClassificationMemorySnapshotRow & { _familyIds: (string | null)[] }
  >();

  for (const candidate of candidates) {
    if (!candidate.normalizedDescription) {
      continue;
    }

    const key = classificationMemoryConflictKey(candidate);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        ownerUserId: candidate.ownerUserId,
        normalizedDescription: candidate.normalizedDescription,
        transactionType: candidate.transactionType,
        categoryId: candidate.categoryId,
        description: candidate.description,
        familyId: candidate.familyId,
        hitCount: 1,
        lastSeenAt: candidate.seenAt,
        _familyIds: [candidate.familyId],
      });
      continue;
    }

    existing.hitCount += 1;
    existing._familyIds.push(candidate.familyId);

    if (candidate.seenAt >= existing.lastSeenAt) {
      existing.lastSeenAt = candidate.seenAt;
      existing.description = candidate.description;
    }

    existing.familyId =
      existing._familyIds.find((id) => id != null) ?? null;
  }

  return [...byKey.values()].map(({ _familyIds: _, ...row }) => row);
}

/**
 * Account ids that must be snapshotted into category_classification_memory
 * before rolling back an import batch (batch target + any twin legs).
 */
export function collectAccountIdsForClassificationSnapshot(
  batchAccountId: string,
  transactionAccountIds: readonly string[],
): string[] {
  const ids = new Set<string>();
  if (batchAccountId) {
    ids.add(batchAccountId);
  }
  for (const accountId of transactionAccountIds) {
    if (accountId) {
      ids.add(accountId);
    }
  }
  return [...ids];
}

/**
 * Persists description→category learning from live transactions so cleanup /
 * import rollback can delete txs without erasing suggestions on reimport.
 */
export async function snapshotCategoryClassificationMemory(
  supabase: SupabaseClient,
  accountIds: readonly string[],
): Promise<{ ok: true; rows: number } | { ok: false; message: string }> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, rows: 0 };
  }

  const { data, error } = await supabase.rpc(
    "snapshot_category_classification_memory",
    { p_account_ids: ids },
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, rows: Number(data ?? 0) };
}
