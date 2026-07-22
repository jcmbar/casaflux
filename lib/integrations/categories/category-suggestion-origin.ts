import type {
  ImportCategorySuggestion,
  ImportCategorySuggestionConfidence,
  ImportCategorySuggestionSource,
} from "../types";

/**
 * User-facing origin groups for import category review (P1 transparency).
 */
export type CategorySuggestionDisplayOrigin =
  | "strong_history"
  | "keyword"
  | "weak_history"
  | "propagated"
  | "none";

export const CATEGORY_SUGGESTION_ORIGIN_LABELS: Record<
  CategorySuggestionDisplayOrigin,
  string
> = {
  strong_history: "Histórico forte",
  keyword: "Palavra-chave",
  weak_history: "Histórico fraco",
  propagated: "Propagado",
  none: "Sem sugestão",
};

export const CATEGORY_SUGGESTION_CONFIDENCE_LABELS: Record<
  ImportCategorySuggestionConfidence,
  string
> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export function formatCategorySuggestionConfidencePt(
  confidence: ImportCategorySuggestionConfidence,
): string {
  return CATEGORY_SUGGESTION_CONFIDENCE_LABELS[confidence];
}

export function resolveCategorySuggestionDisplayOrigin(
  suggestion: ImportCategorySuggestion | null | undefined,
): CategorySuggestionDisplayOrigin {
  if (!suggestion) {
    return "none";
  }

  if (
    suggestion.source === "propagated" ||
    suggestion.propagatedFromSourceLine != null
  ) {
    return "propagated";
  }

  if (suggestion.source === "category_keyword") {
    return "keyword";
  }

  if (suggestion.source === "exact_match") {
    return "strong_history";
  }

  if (
    suggestion.source === "historical_frequency" &&
    suggestion.confidence === "high"
  ) {
    return "strong_history";
  }

  return "weak_history";
}

export function formatCategorySuggestionOriginLabel(
  origin: CategorySuggestionDisplayOrigin,
): string {
  return CATEGORY_SUGGESTION_ORIGIN_LABELS[origin];
}

/**
 * Extra detail after the origin label (keyword term, occurrence count, source line).
 */
export function formatCategorySuggestionOriginDetail(
  suggestion: ImportCategorySuggestion | null | undefined,
): string | null {
  if (!suggestion) {
    return null;
  }

  const origin = resolveCategorySuggestionDisplayOrigin(suggestion);

  if (origin === "keyword" && suggestion.matchedKeyword) {
    return `“${suggestion.matchedKeyword}”`;
  }

  if (
    origin === "propagated" &&
    suggestion.propagatedFromSourceLine != null
  ) {
    return `a partir da linha L${suggestion.propagatedFromSourceLine}`;
  }

  if (origin === "strong_history" || origin === "weak_history") {
    const count = suggestion.basedOnCount;
    if (count > 0) {
      return count === 1 ? "1 ocorrência" : `${count} ocorrências`;
    }
  }

  return null;
}

export function getCategorySuggestionOriginChipClass(
  origin: CategorySuggestionDisplayOrigin,
): string {
  switch (origin) {
    case "strong_history":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
    case "keyword":
      return "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300";
    case "weak_history":
      return "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200";
    case "propagated":
      return "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300";
    case "none":
    default:
      return "border-rose-500/25 bg-rose-500/10 text-rose-800 dark:text-rose-300";
  }
}

/** Engine sources that still map through resolveCategorySuggestionDisplayOrigin. */
export function isImportCategorySuggestionSource(
  value: string,
): value is ImportCategorySuggestionSource {
  return (
    value === "exact_match" ||
    value === "normalized_merchant" ||
    value === "historical_frequency" ||
    value === "category_keyword" ||
    value === "propagated"
  );
}
