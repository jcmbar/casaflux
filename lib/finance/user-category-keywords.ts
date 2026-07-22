import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeImportDescription } from "@/lib/integrations/categories/normalize-merchant";

export const MIN_CATEGORY_KEYWORD_LENGTH = 3;
export const MAX_CATEGORY_KEYWORDS = 40;

/**
 * Normalize a raw keyword for storage and matching (accents stripped, lowercased).
 */
export function normalizeCategoryKeyword(raw: string): string | null {
  const normalized = normalizeImportDescription(raw).replace(/\s+/g, " ").trim();
  if (normalized.length < MIN_CATEGORY_KEYWORD_LENGTH) {
    return null;
  }
  return normalized;
}

/**
 * Deduplicate and normalize a list of keywords for persistence.
 */
export function normalizeCategoryKeywordList(
  keywords: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of keywords) {
    const normalized = normalizeCategoryKeyword(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_CATEGORY_KEYWORDS) {
      break;
    }
  }

  return result;
}

export async function fetchUserCategoryKeywords(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<{
  keywordsByCategoryId: Map<string, string[]>;
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("user_category_keywords")
    .select("category_id, keywords")
    .eq("owner_user_id", ownerUserId);

  if (error) {
    return { keywordsByCategoryId: new Map(), errorMessage: error.message };
  }

  const keywordsByCategoryId = new Map<string, string[]>();
  for (const row of data ?? []) {
    const categoryId = String(row.category_id);
    const keywords = normalizeCategoryKeywordList(
      Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    );
    keywordsByCategoryId.set(categoryId, keywords);
  }

  return { keywordsByCategoryId, errorMessage: null };
}

export async function upsertUserCategoryKeywords(
  supabase: SupabaseClient,
  input: {
    ownerUserId: string;
    categoryId: string;
    keywords: readonly string[];
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const keywords = normalizeCategoryKeywordList(input.keywords);

  if (keywords.length === 0) {
    const { error } = await supabase
      .from("user_category_keywords")
      .delete()
      .eq("owner_user_id", input.ownerUserId)
      .eq("category_id", input.categoryId);

    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  const { error } = await supabase.from("user_category_keywords").upsert(
    {
      owner_user_id: input.ownerUserId,
      category_id: input.categoryId,
      keywords,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_user_id,category_id" },
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
