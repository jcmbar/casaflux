import { describe, expect, it } from "vitest";

import {
  expandClassificationMemoryToHistory,
  mergeCategoryHistorySources,
} from "./category-classification-memory";

describe("category classification memory", () => {
  it("expands hit_count into history samples for the suggester index", () => {
    const history = expandClassificationMemoryToHistory([
      {
        description: "Ifd*Silene Lopes",
        transaction_type: "expense",
        category_id: "cat-food",
        hit_count: 3,
        categories: { id: "cat-food", name: "Alimentação" },
      },
    ]);

    expect(history).toHaveLength(3);
    expect(history.every((row) => row.categoryId === "cat-food")).toBe(true);
    expect(history[0]?.description).toBe("Ifd*Silene Lopes");
  });

  it("merges live transactions ahead of durable memory without dropping learning", () => {
    const merged = mergeCategoryHistorySources(
      [
        {
          description: "Netflix.Com",
          type: "expense",
          categoryId: "cat-stream",
          categoryName: "Assinaturas",
        },
      ],
      [
        {
          description: "Uber Trip",
          type: "expense",
          categoryId: "cat-transport",
          categoryName: "Transporte",
        },
      ],
      10,
    );

    expect(merged.map((row) => row.description)).toEqual([
      "Netflix.Com",
      "Uber Trip",
    ]);
  });
});
