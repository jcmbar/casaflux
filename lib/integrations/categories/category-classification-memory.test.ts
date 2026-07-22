import { describe, expect, it } from "vitest";

import {
  collapseClassificationMemorySnapshotCandidates,
  collectAccountIdsForClassificationSnapshot,
  expandClassificationMemoryToHistory,
  mergeCategoryHistorySources,
} from "./category-classification-memory";
import { enrichPreviewWithCategorySuggestions } from "./category-suggestion-service";
import {
  buildCategoryHistoryIndex,
  suggestCategoryForDescription,
} from "./category-suggester";
import { buildImportPreview } from "../core/import-orchestrator";
import { normalizeImportDescription } from "./normalize-merchant";

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

  it("collects batch + twin account ids for pre-rollback memory snapshot", () => {
    expect(
      collectAccountIdsForClassificationSnapshot("card-1", [
        "card-1",
        "checking-1",
        "card-1",
      ]),
    ).toEqual(["card-1", "checking-1"]);
  });
});

describe("collapseClassificationMemorySnapshotCandidates", () => {
  it("collapses candidates that share the ON CONFLICT key before upsert", () => {
    // Same normalized description from different raw strings / family_ids —
    // the bug that caused "ON CONFLICT DO UPDATE cannot affect row a second time".
    const normalized = normalizeImportDescription("Uber  Trip");
    expect(normalizeImportDescription("Uber Trip")).toBe(normalized);

    const collapsed = collapseClassificationMemorySnapshotCandidates([
      {
        ownerUserId: "user-1",
        description: "Uber Trip",
        normalizedDescription: normalized,
        transactionType: "expense",
        categoryId: "cat-transport",
        familyId: null,
        seenAt: "2026-07-01T10:00:00.000Z",
      },
      {
        ownerUserId: "user-1",
        description: "Uber  Trip",
        normalizedDescription: normalized,
        transactionType: "expense",
        categoryId: "cat-transport",
        familyId: "family-1",
        seenAt: "2026-07-10T10:00:00.000Z",
      },
      {
        ownerUserId: "user-1",
        description: "Uber Trip",
        normalizedDescription: normalized,
        transactionType: "expense",
        categoryId: "cat-transport",
        familyId: "family-1",
        seenAt: "2026-07-05T10:00:00.000Z",
      },
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      ownerUserId: "user-1",
      normalizedDescription: normalized,
      transactionType: "expense",
      categoryId: "cat-transport",
      hitCount: 3,
      familyId: "family-1",
      description: "Uber  Trip",
      lastSeenAt: "2026-07-10T10:00:00.000Z",
    });
  });

  it("keeps separate rows when category or type differs", () => {
    const normalized = normalizeImportDescription("Pagamento recebido");
    const collapsed = collapseClassificationMemorySnapshotCandidates([
      {
        ownerUserId: "user-1",
        description: "Pagamento recebido",
        normalizedDescription: normalized,
        transactionType: "income",
        categoryId: "cat-a",
        familyId: null,
        seenAt: "2026-07-01T10:00:00.000Z",
      },
      {
        ownerUserId: "user-1",
        description: "Pagamento recebido",
        normalizedDescription: normalized,
        transactionType: "expense",
        categoryId: "cat-a",
        familyId: null,
        seenAt: "2026-07-01T10:00:00.000Z",
      },
    ]);

    expect(collapsed).toHaveLength(2);
  });
});

describe("import → learn → rollback → reimport category recognition", () => {
  const categories = [
    { id: "cat-food", name: "Alimentação", type: "expense" as const },
  ];

  it("still suggests categories from durable memory after live txs are removed", () => {
    const learnedFromImport = [
      {
        description: "Ifd*Silene Lopes",
        type: "expense" as const,
        categoryId: "cat-food",
        categoryName: "Alimentação",
      },
    ];

    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-01,Ifd*Silene Lopes,"42,00"',
      ].join("\n"),
      cardAccountId: "card-1",
    });

    const beforeRollback = enrichPreviewWithCategorySuggestions(
      preview,
      learnedFromImport,
      categories,
    );
    expect(beforeRollback.rows[0]?.categorySuggestion?.categoryId).toBe(
      "cat-food",
    );

    const memoryOnly = expandClassificationMemoryToHistory([
      {
        description: "Ifd*Silene Lopes",
        transaction_type: "expense",
        category_id: "cat-food",
        hit_count: 2,
        categories: { id: "cat-food", name: "Alimentação" },
      },
    ]);
    const afterRollbackHistory = mergeCategoryHistorySources(
      [],
      memoryOnly,
      500,
    );

    const index = buildCategoryHistoryIndex(afterRollbackHistory);
    const suggestion = suggestCategoryForDescription({
      description: "Ifd*Silene Lopes",
      transactionType: "expense",
      index,
      categories,
    });
    expect(suggestion?.categoryId).toBe("cat-food");

    const afterReimport = enrichPreviewWithCategorySuggestions(
      preview,
      afterRollbackHistory,
      categories,
    );
    expect(afterReimport.rows[0]?.categorySuggestion?.categoryId).toBe(
      "cat-food",
    );
    expect(afterReimport.rows[0]?.categoryStatus).toBe("suggested");
  });
});
