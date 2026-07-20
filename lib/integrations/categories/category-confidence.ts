import type {
  ImportCategorySuggestionConfidence,
  ImportCategorySuggestionSource,
} from "../types";

export const HIGH_FREQUENCY_MIN_COUNT = 3;
export const HIGH_FREQUENCY_MIN_RATIO = 0.8;
export const MEDIUM_FREQUENCY_MIN_COUNT = 2;
export const MEDIUM_FREQUENCY_MIN_RATIO = 0.6;
export const AMBIGUOUS_MAX_RATIO = 0.6;

export type CategoryCountMap = Map<string, number>;

export function getDominantCategory(counts: CategoryCountMap): {
  categoryId: string;
  count: number;
  total: number;
  ratio: number;
} | null {
  if (counts.size === 0) {
    return null;
  }

  let categoryId = "";
  let count = 0;
  let total = 0;

  for (const [id, value] of counts) {
    total += value;
    if (value > count) {
      categoryId = id;
      count = value;
    }
  }

  if (!categoryId) {
    return null;
  }

  return {
    categoryId,
    count,
    total,
    ratio: total > 0 ? count / total : 0,
  };
}

export function resolveSuggestionConfidence(input: {
  source: ImportCategorySuggestionSource;
  dominantCount: number;
  totalCount: number;
  ratio: number;
  distinctCategories: number;
}): ImportCategorySuggestionConfidence | null {
  if (input.distinctCategories > 1 && input.ratio < AMBIGUOUS_MAX_RATIO) {
    return "low";
  }

  if (input.source === "exact_match" && input.dominantCount >= 1) {
    return "high";
  }

  if (
    input.source === "historical_frequency" &&
    input.totalCount >= HIGH_FREQUENCY_MIN_COUNT &&
    input.ratio >= HIGH_FREQUENCY_MIN_RATIO
  ) {
    return "high";
  }

  if (
    input.totalCount >= MEDIUM_FREQUENCY_MIN_COUNT &&
    input.ratio >= MEDIUM_FREQUENCY_MIN_RATIO
  ) {
    return "medium";
  }

  if (input.dominantCount >= 1 && input.ratio < AMBIGUOUS_MAX_RATIO) {
    return "low";
  }

  return null;
}

export function shouldAutoConfirmConfidence(
  confidence: ImportCategorySuggestionConfidence,
): boolean {
  return confidence === "high";
}
