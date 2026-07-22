import { describe, expect, it } from "vitest";

import type { ImportCategorySuggestion } from "../types";
import {
  formatCategorySuggestionConfidencePt,
  formatCategorySuggestionOriginDetail,
  formatCategorySuggestionOriginLabel,
  resolveCategorySuggestionDisplayOrigin,
} from "./category-suggestion-origin";

function suggestion(
  partial: Partial<ImportCategorySuggestion> &
    Pick<ImportCategorySuggestion, "source" | "confidence">,
): ImportCategorySuggestion {
  return {
    categoryId: "cat-1",
    categoryName: "Farmácia",
    basedOnCount: 3,
    ...partial,
  };
}

describe("category-suggestion-origin", () => {
  it("maps engine sources to readable origin labels", () => {
    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({ source: "exact_match", confidence: "high" }),
      ),
    ).toBe("strong_history");
    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({
          source: "historical_frequency",
          confidence: "high",
          basedOnCount: 8,
        }),
      ),
    ).toBe("strong_history");
    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({
          source: "historical_frequency",
          confidence: "medium",
          basedOnCount: 2,
        }),
      ),
    ).toBe("weak_history");
    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({
          source: "normalized_merchant",
          confidence: "medium",
        }),
      ),
    ).toBe("weak_history");
    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({
          source: "category_keyword",
          confidence: "medium",
          matchedKeyword: "drogasil",
        }),
      ),
    ).toBe("keyword");
    expect(resolveCategorySuggestionDisplayOrigin(null)).toBe("none");
  });

  it("marks propagated source and source-line meta as Propagado", () => {
    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({
          source: "propagated",
          confidence: "medium",
          propagatedFromSourceLine: 4,
        }),
      ),
    ).toBe("propagated");

    expect(
      resolveCategorySuggestionDisplayOrigin(
        suggestion({
          source: "exact_match",
          confidence: "high",
          propagatedFromSourceLine: 4,
        }),
      ),
    ).toBe("propagated");
  });

  it("formats Portuguese labels and keyword/propagation detail", () => {
    expect(formatCategorySuggestionOriginLabel("strong_history")).toBe(
      "Histórico forte",
    );
    expect(formatCategorySuggestionOriginLabel("keyword")).toBe("Palavra-chave");
    expect(formatCategorySuggestionOriginLabel("weak_history")).toBe(
      "Histórico fraco",
    );
    expect(formatCategorySuggestionOriginLabel("propagated")).toBe("Propagado");
    expect(formatCategorySuggestionOriginLabel("none")).toBe("Sem sugestão");

    expect(formatCategorySuggestionConfidencePt("high")).toBe("Alta");
    expect(formatCategorySuggestionConfidencePt("medium")).toBe("Média");
    expect(formatCategorySuggestionConfidencePt("low")).toBe("Baixa");

    expect(
      formatCategorySuggestionOriginDetail(
        suggestion({
          source: "category_keyword",
          confidence: "medium",
          matchedKeyword: "drogasil",
        }),
      ),
    ).toBe("“drogasil”");

    expect(
      formatCategorySuggestionOriginDetail(
        suggestion({
          source: "propagated",
          confidence: "medium",
          propagatedFromSourceLine: 12,
        }),
      ),
    ).toBe("a partir da linha L12");
  });
});
