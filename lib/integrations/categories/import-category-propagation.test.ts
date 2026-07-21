import { describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "../types";
import { resolveImportRowTransactionType } from "./category-suggester";
import {
  applyCategoryPropagation,
  buildImportCategoryGroup,
  detectStrongMerchantPrefix,
  formatImportCategoryPropagationLabel,
  getSimilarUncategorizedLines,
  shouldAutoPropagateCategory,
} from "./import-category-propagation";

const CATEGORIES = [
  { id: "cat-food", name: "Mercado", type: "expense" as const },
  { id: "cat-transport", name: "Transporte", type: "expense" as const },
];

function buildRow(
  partial: Partial<ImportPreviewRow> & Pick<ImportPreviewRow, "sourceLine" | "description">,
): ImportPreviewRow {
  return {
    source: "nubank_credit_card",
    date: "2026-07-01",
    amount: 10,
    direction: "out",
    kind: "card_purchase",
    externalFingerprint: `fp-${partial.sourceLine}`,
    externalId: null,
    metadata: {},
    reviewStatus: "ready",
    historicalStatus: "new",
    categoryStatus: "none",
    confirmedCategoryId: null,
    normalizedMerchant: partial.description.toLowerCase().includes("ifd")
      ? "ifd silene lopes de al"
      : partial.description.toLowerCase().includes("uber")
        ? "uber trip"
        : undefined,
    ...partial,
  };
}

describe("import category propagation groups", () => {
  it("detects strong merchant prefixes from origin markers", () => {
    expect(detectStrongMerchantPrefix("Ifd*Silene Lopes de Al")).toBe("ifd");
    expect(detectStrongMerchantPrefix("Ebn *Playstation - Parcela 1/2")).toBe("ebn");
    expect(detectStrongMerchantPrefix("IFD*50.039.745 Daniel")).toBe("ifd");
  });

  it("groups ifd* lines by strong prefix instead of full merchant text", () => {
    const rows = [
      buildRow({ sourceLine: 1, description: "Ifd*Silene Lopes de Al" }),
      buildRow({
        sourceLine: 2,
        description: "Ifd*Outro Restaurante",
        normalizedMerchant: "ifd outro restaurante",
      }),
      buildRow({
        sourceLine: 3,
        description: "IFD*50.039.745 Daniel",
        normalizedMerchant: "ifd 50 039 745 daniel",
      }),
      buildRow({
        sourceLine: 4,
        description: "Uber Trip",
        normalizedMerchant: "uber trip",
      }),
    ];

    expect(buildImportCategoryGroup(rows[0])?.kind).toBe("strong_prefix");
    expect(buildImportCategoryGroup(rows[0])?.key).toBe(
      buildImportCategoryGroup(rows[1])?.key,
    );
    expect(buildImportCategoryGroup(rows[0])?.key).toBe(
      buildImportCategoryGroup(rows[2])?.key,
    );
    expect(buildImportCategoryGroup(rows[0])?.reason).toBe(
      "Similar por prefixo forte: IFD",
    );
    expect(buildImportCategoryGroup(rows[3])?.key).not.toBe(
      buildImportCategoryGroup(rows[0])?.key,
    );
  });

  it("groups bank transfers by semantic pattern regardless of person name", () => {
    const rows = [
      buildRow({
        sourceLine: 1,
        description: "Transferência recebida pelo Pix - Jefferson Calmon",
        direction: "in",
        kind: "bank_income",
        source: "nubank_checking",
      }),
      buildRow({
        sourceLine: 2,
        description: "Transferência recebida - Maria Silva",
        direction: "in",
        kind: "bank_income",
        source: "nubank_checking",
      }),
      buildRow({
        sourceLine: 3,
        description: "Transferência enviada - Outro Nome",
        direction: "out",
        kind: "bank_transfer_out",
        source: "nubank_checking",
      }),
    ];

    expect(buildImportCategoryGroup(rows[0])?.kind).toBe("semantic_pattern");
    expect(buildImportCategoryGroup(rows[0])?.key).toBe(
      buildImportCategoryGroup(rows[1])?.key,
    );
    expect(buildImportCategoryGroup(rows[0])?.reason).toBe(
      "Similar por padrão: transferência recebida",
    );
    expect(buildImportCategoryGroup(rows[2])?.key).not.toBe(
      buildImportCategoryGroup(rows[0])?.key,
    );
  });

  it("finds similar uncategorized lines in the same group", () => {
    const rows = [
      buildRow({ sourceLine: 1, description: "Ifd*Silene Lopes de Al" }),
      buildRow({
        sourceLine: 2,
        description: "Ifd*Outro Restaurante",
        normalizedMerchant: "ifd outro restaurante",
      }),
      buildRow({
        sourceLine: 3,
        description: "Ifd*Confirmada",
        normalizedMerchant: "ifd confirmada",
        categoryStatus: "confirmed",
        confirmedCategoryId: "cat-food",
      }),
    ];

    expect(getSimilarUncategorizedLines(rows, 1).map((row) => row.sourceLine)).toEqual([
      2,
    ]);
  });
});

describe("applyCategoryPropagation", () => {
  const rows = [
    buildRow({ sourceLine: 1, description: "Ifd*Silene Lopes de Al" }),
    buildRow({
      sourceLine: 2,
      description: "Ifd*Outro Restaurante",
      normalizedMerchant: "ifd outro restaurante",
    }),
    buildRow({
      sourceLine: 3,
      description: "Ifd*Manual",
      normalizedMerchant: "ifd manual",
      categoryStatus: "confirmed",
      confirmedCategoryId: "cat-transport",
    }),
  ];

  it("auto-propagates ifd* lines in automatic mode", () => {
    const result = applyCategoryPropagation({
      rows,
      sourceLine: 1,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "automatic",
    });

    expect(result.autoPropagated).toBe(true);
    expect(result.propagatedLines).toEqual([2]);
    expect(
      result.rows.find((row) => row.sourceLine === 2)?.confirmedCategoryId,
    ).toBe("cat-food");
    expect(
      result.rows.find((row) => row.sourceLine === 3)?.confirmedCategoryId,
    ).toBe("cat-transport");
  });

  it("does not overwrite manually confirmed lines", () => {
    const result = applyCategoryPropagation({
      rows,
      sourceLine: 1,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "automatic",
    });

    expect(result.rows.find((row) => row.sourceLine === 3)?.confirmedCategoryId).toBe(
      "cat-transport",
    );
  });

  it("offers propagation in assisted mode without auto applying", () => {
    const result = applyCategoryPropagation({
      rows,
      sourceLine: 1,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "assisted",
    });

    expect(result.autoPropagated).toBe(false);
    expect(result.propagatedLines).toEqual([]);
    expect(result.offer?.similarLines).toEqual([2]);
    expect(formatImportCategoryPropagationLabel(result.offer?.similarLines.length ?? 0)).toBe(
      "Aplicar também a 1 semelhante",
    );
  });

  it("applies to similar lines when assisted propagation is confirmed", () => {
    const result = applyCategoryPropagation({
      rows,
      sourceLine: 1,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "assisted",
      forcePropagate: true,
    });

    expect(result.propagatedLines).toEqual([2]);
    expect(result.offer).toBeNull();
  });

  it("only highlights similar lines in manual mode", () => {
    const result = applyCategoryPropagation({
      rows,
      sourceLine: 1,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "manual",
    });

    expect(result.autoPropagated).toBe(false);
    expect(result.propagatedLines).toEqual([]);
    expect(result.offer?.similarLines).toEqual([2]);
    expect(
      result.rows.find((row) => row.sourceLine === 2)?.categoryStatus,
    ).toBe("none");
  });

  it("does not auto-propagate exact merchant groups without high confidence", () => {
    const merchantRows = [
      buildRow({
        sourceLine: 10,
        description: "Netflix.Com",
        normalizedMerchant: "netflix com",
        categoryStatus: "suggested",
        categorySuggestion: {
          categoryId: "cat-food",
          categoryName: "Mercado",
          confidence: "medium",
          source: "normalized_merchant",
          basedOnCount: 2,
        },
      }),
      buildRow({
        sourceLine: 11,
        description: "Netflix.Com",
        normalizedMerchant: "netflix com",
      }),
    ];

    expect(resolveImportRowTransactionType(merchantRows[0]!)).toBe("expense");
    expect(shouldAutoPropagateCategory("automatic", "medium")).toBe(false);

    const result = applyCategoryPropagation({
      rows: merchantRows,
      sourceLine: 10,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "automatic",
    });

    expect(result.autoPropagated).toBe(false);
    expect(result.offer?.similarLines).toEqual([11]);
  });

  it("does not auto-propagate weak cleaned-description signatures", () => {
    const weakRows = [
      buildRow({
        sourceLine: 20,
        description: "Compra Avulsa Local 998877",
        normalizedMerchant: "ab",
      }),
      buildRow({
        sourceLine: 21,
        description: "Compra Avulsa Local 112233",
        normalizedMerchant: "ab",
      }),
    ];

    expect(buildImportCategoryGroup(weakRows[0])?.strength).toBe("low");

    const result = applyCategoryPropagation({
      rows: weakRows,
      sourceLine: 20,
      categoryId: "cat-food",
      catalog: CATEGORIES,
      mode: "automatic",
    });

    expect(result.autoPropagated).toBe(false);
    expect(result.offer?.similarLines).toEqual([21]);
    expect(result.offer?.group.reason).toContain("Similar por descrição:");
  });
});
