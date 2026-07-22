"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatCategorySuggestionConfidencePt,
  formatCategorySuggestionOriginDetail,
  formatCategorySuggestionOriginLabel,
  getCategorySuggestionOriginChipClass,
  resolveCategorySuggestionDisplayOrigin,
} from "@/lib/integrations/categories/category-suggestion-origin";
import type { ImportCategorySuggestion } from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

export function CategorySuggestionOriginChip({
  suggestion,
  className,
  showConfidence = false,
}: {
  suggestion: ImportCategorySuggestion | null | undefined;
  className?: string;
  showConfidence?: boolean;
}) {
  const origin = resolveCategorySuggestionDisplayOrigin(suggestion);
  const detail = formatCategorySuggestionOriginDetail(suggestion);

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-normal",
        getCategorySuggestionOriginChipClass(origin),
        className,
      )}
      data-testid="category-suggestion-origin-chip"
      data-origin={origin}
    >
      <span>{formatCategorySuggestionOriginLabel(origin)}</span>
      {detail ? <span>· {detail}</span> : null}
      {showConfidence && suggestion ? (
        <span className="opacity-80">
          · {formatCategorySuggestionConfidencePt(suggestion.confidence)}
        </span>
      ) : null}
    </Badge>
  );
}

export function CategorySuggestionSummaryLine({
  suggestion,
  categoryName,
}: {
  suggestion: ImportCategorySuggestion | null | undefined;
  categoryName?: string | null;
}) {
  if (!suggestion) {
    return (
      <p className="text-xs text-muted-foreground">
        <CategorySuggestionOriginChip suggestion={null} />
        <span className="ml-2">
          Sem sugestão automática. Escolha uma categoria ou crie uma nova.
        </span>
      </p>
    );
  }

  const name = categoryName ?? suggestion.categoryName;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        Sugestão:{" "}
        <span className="font-medium text-foreground">{name}</span>
      </span>
      <CategorySuggestionOriginChip suggestion={suggestion} showConfidence />
    </div>
  );
}
