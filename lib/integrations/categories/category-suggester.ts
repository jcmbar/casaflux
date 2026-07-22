import type { TransactionType } from "@/types/transaction";
import type { ImportCategorySuggestion, ImportPreviewRow } from "../types";
import {
  getDominantCategory,
  resolveSuggestionConfidence,
  type CategoryCountMap,
} from "./category-confidence";
import {
  normalizeImportDescription,
  normalizeImportText,
  normalizeMerchant,
} from "./normalize-merchant";

export type CategorySuggestionCatalogItem = {
  id: string;
  name: string;
  type: TransactionType;
  /** User-authored recognition keywords (already normalized). */
  keywords?: string[];
};

export type CategoryHistoryTransaction = {
  description: string;
  categoryId: string;
  categoryName: string;
  type: TransactionType;
};

export type CategoryHistoryIndex = {
  exactByDescription: Map<string, CategoryCountMap>;
  byMerchant: Map<string, CategoryCountMap>;
  categoryNamesById: Map<string, string>;
};

function incrementCount(map: CategoryCountMap, categoryId: string) {
  map.set(categoryId, (map.get(categoryId) ?? 0) + 1);
}

export function buildCategoryHistoryIndex(
  transactions: CategoryHistoryTransaction[],
): CategoryHistoryIndex {
  const exactByDescription = new Map<string, CategoryCountMap>();
  const byMerchant = new Map<string, CategoryCountMap>();
  const categoryNamesById = new Map<string, string>();

  for (const transaction of transactions) {
    if (!transaction.categoryId) {
      continue;
    }

    categoryNamesById.set(transaction.categoryId, transaction.categoryName);

    const normalizedDescription = normalizeImportDescription(
      transaction.description,
    );
    const normalizedMerchant = normalizeMerchant(transaction.description);

    const exactCounts =
      exactByDescription.get(normalizedDescription) ??
      new Map<string, number>();
    incrementCount(exactCounts, transaction.categoryId);
    exactByDescription.set(normalizedDescription, exactCounts);

    if (normalizedMerchant) {
      const merchantCounts =
        byMerchant.get(normalizedMerchant) ?? new Map<string, number>();
      incrementCount(merchantCounts, transaction.categoryId);
      byMerchant.set(normalizedMerchant, merchantCounts);
    }
  }

  return {
    exactByDescription,
    byMerchant,
    categoryNamesById,
  };
}

function buildSuggestion(
  categoryId: string,
  categoryName: string,
  source: ImportCategorySuggestion["source"],
  basedOnCount: number,
  totalCount: number,
  distinctCategories: number,
  matchedKeyword?: string,
): ImportCategorySuggestion | null {
  const ratio = totalCount > 0 ? basedOnCount / totalCount : 0;
  const confidence = resolveSuggestionConfidence({
    source,
    dominantCount: basedOnCount,
    totalCount,
    ratio,
    distinctCategories,
  });

  if (!confidence) {
    return null;
  }

  return {
    categoryId,
    categoryName,
    confidence,
    source,
    basedOnCount,
    matchedKeyword,
  };
}

function isValidCategoryForType(
  categoryId: string,
  transactionType: TransactionType,
  categories: CategorySuggestionCatalogItem[],
): boolean {
  return categories.some(
    (category) =>
      category.id === categoryId && category.type === transactionType,
  );
}

function resolveHistorySuggestion(input: {
  description: string;
  transactionType: TransactionType;
  index: CategoryHistoryIndex;
  categories: CategorySuggestionCatalogItem[];
}): ImportCategorySuggestion | null {
  const normalized = normalizeImportText(input.description);

  const exactCounts = input.index.exactByDescription.get(
    normalized.normalizedDescription,
  );
  if (exactCounts && exactCounts.size > 0) {
    const dominant = getDominantCategory(exactCounts);
    if (
      dominant &&
      isValidCategoryForType(
        dominant.categoryId,
        input.transactionType,
        input.categories,
      )
    ) {
      const categoryName =
        input.index.categoryNamesById.get(dominant.categoryId) ??
        input.categories.find((category) => category.id === dominant.categoryId)
          ?.name ??
        "";

      return buildSuggestion(
        dominant.categoryId,
        categoryName,
        "exact_match",
        dominant.count,
        dominant.total,
        exactCounts.size,
      );
    }
  }

  if (!normalized.normalizedMerchant) {
    return null;
  }

  const merchantCounts = input.index.byMerchant.get(
    normalized.normalizedMerchant,
  );
  if (!merchantCounts || merchantCounts.size === 0) {
    return null;
  }

  const dominant = getDominantCategory(merchantCounts);
  if (
    !dominant ||
    !isValidCategoryForType(
      dominant.categoryId,
      input.transactionType,
      input.categories,
    )
  ) {
    return null;
  }

  const categoryName =
    input.index.categoryNamesById.get(dominant.categoryId) ??
    input.categories.find((category) => category.id === dominant.categoryId)
      ?.name ??
    "";

  const source: ImportCategorySuggestion["source"] =
    dominant.total >= 3 ? "historical_frequency" : "normalized_merchant";

  return buildSuggestion(
    dominant.categoryId,
    categoryName,
    source,
    dominant.count,
    dominant.total,
    merchantCounts.size,
  );
}

type KeywordHit = {
  categoryId: string;
  categoryName: string;
  keyword: string;
  onMerchant: boolean;
};

/**
 * Match user keywords against normalized description/merchant.
 * Longer keywords win; merchant hits beat description-only.
 */
export function suggestCategoryFromKeywords(input: {
  description: string;
  transactionType: TransactionType;
  categories: CategorySuggestionCatalogItem[];
}): ImportCategorySuggestion | null {
  const normalized = normalizeImportText(input.description);
  const description = normalized.normalizedDescription;
  const merchant = normalized.normalizedMerchant;
  const hits: KeywordHit[] = [];

  for (const category of input.categories) {
    if (category.type !== input.transactionType) {
      continue;
    }
    const keywords = category.keywords ?? [];
    for (const keyword of keywords) {
      if (!keyword) {
        continue;
      }
      const onMerchant = Boolean(merchant && merchant.includes(keyword));
      const onDescription = description.includes(keyword);
      if (!onMerchant && !onDescription) {
        continue;
      }
      hits.push({
        categoryId: category.id,
        categoryName: category.name,
        keyword,
        onMerchant,
      });
    }
  }

  if (hits.length === 0) {
    return null;
  }

  hits.sort((left, right) => {
    if (left.keyword.length !== right.keyword.length) {
      return right.keyword.length - left.keyword.length;
    }
    if (left.onMerchant !== right.onMerchant) {
      return left.onMerchant ? -1 : 1;
    }
    return left.keyword.localeCompare(right.keyword);
  });

  const best = hits[0]!;
  const distinctCategories = new Set(hits.map((hit) => hit.categoryId)).size;

  return buildSuggestion(
    best.categoryId,
    best.categoryName,
    "category_keyword",
    // dominantCount carries keyword length for confidence thresholds.
    best.keyword.length,
    best.keyword.length,
    distinctCategories,
    best.keyword,
  );
}

function isStrongHistorySuggestion(
  suggestion: ImportCategorySuggestion | null,
): boolean {
  return suggestion?.confidence === "high";
}

/**
 * Priority:
 * 1. Strong historical memory (exact / high-frequency)
 * 2. User category keywords
 * 3. Weaker historical fallback (normalized merchant / low confidence)
 */
export function suggestCategoryForDescription(input: {
  description: string;
  transactionType: TransactionType;
  index: CategoryHistoryIndex;
  categories: CategorySuggestionCatalogItem[];
}): ImportCategorySuggestion | null {
  const history = resolveHistorySuggestion(input);
  if (isStrongHistorySuggestion(history)) {
    return history;
  }

  const keyword = suggestCategoryFromKeywords(input);
  if (keyword) {
    return keyword;
  }

  return history;
}

export function resolveImportRowTransactionType(
  row: ImportPreviewRow,
): TransactionType {
  if (row.kind === "bank_income") {
    return "income";
  }

  if (row.kind === "bank_reversal" && row.direction === "in") {
    return "income";
  }

  if (row.kind === "card_invoice_payment") {
    return "expense";
  }

  if (row.source === "nubank_credit_card" && row.direction === "in") {
    return "income";
  }

  return "expense";
}

export function suggestCategoryForImportRow(
  row: ImportPreviewRow,
  index: CategoryHistoryIndex,
  categories: CategorySuggestionCatalogItem[],
): ImportCategorySuggestion | null {
  return suggestCategoryForDescription({
    description: row.description,
    transactionType: resolveImportRowTransactionType(row),
    index,
    categories,
  });
}
