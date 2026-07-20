import { describe, expect, it } from "vitest";

import { buildImportPreview } from "../core/import-orchestrator";
import {
  applyConfirmedCategoryToRow,
  applyHighConfidenceCategorySuggestions,
  enrichPreviewWithCategorySuggestions,
  getConfirmedCategoryForCommit,
} from "./category-suggestion-service";
import { normalizeMerchant } from "./normalize-merchant";
import {
  buildCategoryHistoryIndex,
  suggestCategoryForDescription,
  type CategoryHistoryTransaction,
} from "./category-suggester";

const CATEGORIES = [
  { id: "cat-streaming", name: "Assinaturas", type: "expense" as const },
  { id: "cat-health", name: "Saúde", type: "expense" as const },
  { id: "cat-games", name: "Lazer", type: "expense" as const },
  { id: "cat-income", name: "Receitas", type: "income" as const },
];

const HISTORY: CategoryHistoryTransaction[] = [
  {
    description: "Netflix.Com",
    categoryId: "cat-streaming",
    categoryName: "Assinaturas",
    type: "expense",
  },
  {
    description: "UNIMED SAO JOSE",
    categoryId: "cat-health",
    categoryName: "Saúde",
    type: "expense",
  },
  {
    description: "Ebn *Playstation - Parcela 1/2",
    categoryId: "cat-games",
    categoryName: "Lazer",
    type: "expense",
  },
  {
    description: "Ebn *Playstation - Parcela 2/2",
    categoryId: "cat-games",
    categoryName: "Lazer",
    type: "expense",
  },
  {
    description: "Ebn *Playstation - Parcela 3/2",
    categoryId: "cat-games",
    categoryName: "Lazer",
    type: "expense",
  },
  {
    description: "Ifd*Silene Lopes de Al",
    categoryId: "cat-streaming",
    categoryName: "Assinaturas",
    type: "expense",
  },
  {
    description: "Ifd*Silene Lopes de Al",
    categoryId: "cat-health",
    categoryName: "Saúde",
    type: "expense",
  },
];

describe("normalizeMerchant", () => {
  it("removes parcel suffix and normalizes merchant tokens", () => {
    expect(normalizeMerchant("Ebn *Playstation - Parcela 1/2")).toBe("ebn playstation");
    expect(normalizeMerchant("Netflix.Com")).toBe("netflix com");
  });
});

describe("suggestCategoryForDescription", () => {
  const index = buildCategoryHistoryIndex(HISTORY);

  it("matches exact descriptions with high confidence", () => {
    const suggestion = suggestCategoryForDescription({
      description: "Netflix.Com",
      transactionType: "expense",
      index,
      categories: CATEGORIES,
    });

    expect(suggestion).toMatchObject({
      categoryId: "cat-streaming",
      confidence: "high",
      source: "exact_match",
    });
  });

  it("matches normalized merchant frequency with high confidence", () => {
    const suggestion = suggestCategoryForDescription({
      description: "Ebn*Playstation - Parcela 10/10",
      transactionType: "expense",
      index,
      categories: CATEGORIES,
    });

    expect(suggestion).toMatchObject({
      categoryId: "cat-games",
      confidence: "high",
      source: "historical_frequency",
      basedOnCount: 3,
    });
  });

  it("returns low confidence when merchant history conflicts", () => {
    const suggestion = suggestCategoryForDescription({
      description: "Ifd*Silene Lopes de Al",
      transactionType: "expense",
      index,
      categories: CATEGORIES,
    });

    expect(suggestion?.confidence).toBe("low");
  });
});

describe("enrichPreviewWithCategorySuggestions", () => {
  it("adds suggestions to import preview rows without auto-confirming", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-20,Netflix.Com,"10,90"',
        '2026-07-05,Ebn *Playstation - Parcela 1/2,"65,00"',
      ].join("\n"),
      cardAccountId: "card-1",
    });

    const enriched = enrichPreviewWithCategorySuggestions(preview, HISTORY, CATEGORIES);

    expect(enriched.categorySummary?.suggestedCount).toBe(2);
    expect(enriched.rows[0]?.categoryStatus).toBe("suggested");
    expect(enriched.rows[0]?.categorySuggestion?.categoryId).toBe("cat-streaming");
    expect(enriched.rows[1]?.categorySuggestion?.confidence).toBe("high");
    expect(enriched.rows.every((row) => row.categoryStatus !== "confirmed")).toBe(true);
  });

  it("supports batch confirmation for high confidence only", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-20,Netflix.Com,"10,90"',
        '2026-07-05,Ebn *Playstation - Parcela 1/2,"65,00"',
      ].join("\n"),
      cardAccountId: "card-1",
    });

    const enriched = enrichPreviewWithCategorySuggestions(preview, HISTORY, CATEGORIES);
    const confirmedRows = applyHighConfidenceCategorySuggestions(enriched.rows, CATEGORIES);

    expect(confirmedRows.filter((row) => row.categoryStatus === "confirmed")).toHaveLength(2);
    expect(getConfirmedCategoryForCommit(confirmedRows[0]!)).toBe("cat-streaming");
  });

  it("keeps manual confirmation separate from suggestions", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-20,Unknown Merchant,"10,00"',
      ].join("\n"),
      cardAccountId: "card-1",
    });

    const enriched = enrichPreviewWithCategorySuggestions(preview, [], CATEGORIES);
    const manual = applyConfirmedCategoryToRow(
      enriched.rows[0]!,
      "cat-games",
      CATEGORIES,
    );

    expect(manual.categoryStatus).toBe("confirmed");
    expect(getConfirmedCategoryForCommit(manual)).toBe("cat-games");
  });
});
