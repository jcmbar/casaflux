import { describe, expect, it } from "vitest";

import type { ImportPreviewRow } from "../types";
import {
  buildImportCategorySimilaritySignature,
  cleanDescriptionForSimilarity,
  detectSemanticBankPattern,
  detectStrongMerchantPrefix,
  formatImportCategorySimilarityReason,
} from "./import-category-similarity";

function buildRow(
  partial: Partial<ImportPreviewRow> &
    Pick<ImportPreviewRow, "sourceLine" | "description">,
): ImportPreviewRow {
  return {
    source: "nubank_checking",
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
    ...partial,
  };
}

describe("import category similarity signatures", () => {
  it("detects strong prefixes including IFD with document-like suffixes", () => {
    expect(detectStrongMerchantPrefix("IFD*Branize Aparecida")).toBe("ifd");
    expect(detectStrongMerchantPrefix("IFD*50.039.745 Daniel")).toBe("ifd");
    expect(detectStrongMerchantPrefix("Ebn *Playstation - Parcela 1/2")).toBe(
      "ebn",
    );
    expect(detectStrongMerchantPrefix("Uber Trip")).toBe("uber");
  });

  it("groups IFD lines with different names/documents under the same signature", () => {
    const branize = buildRow({
      sourceLine: 1,
      description: "IFD*Branize Aparecida",
      source: "nubank_credit_card",
    });
    const daniel = buildRow({
      sourceLine: 2,
      description: "IFD*50.039.745 Daniel",
      source: "nubank_credit_card",
      normalizedMerchant: "ifd 50 039 745 daniel",
    });

    const a = buildImportCategorySimilaritySignature(branize);
    const b = buildImportCategorySimilaritySignature(daniel);

    expect(a?.kind).toBe("strong_prefix");
    expect(a?.key).toBe(b?.key);
    expect(a?.key).toBe("expense:strong:ifd");
    expect(a?.reason).toBe("Similar por prefixo forte: IFD");
  });

  it("detects semantic bank patterns ignoring variable person names", () => {
    expect(
      detectSemanticBankPattern(
        "Transferência recebida pelo Pix - Jefferson Calmon",
      )?.id,
    ).toBe("transferencia_recebida");
    expect(
      detectSemanticBankPattern("Transferência recebida - Maria Silva")?.id,
    ).toBe("transferencia_recebida");
    expect(
      detectSemanticBankPattern("Transferência enviada pelo Pix - Ana")?.id,
    ).toBe("transferencia_enviada");
  });

  it("groups transfers with different names by semantic operation signature", () => {
    const jefferson = buildRow({
      sourceLine: 1,
      description: "Transferência recebida pelo Pix - Jefferson Calmon",
      direction: "in",
      kind: "bank_income",
    });
    const maria = buildRow({
      sourceLine: 2,
      description: "Transferência recebida - Maria Silva",
      direction: "in",
      kind: "bank_income",
    });

    const a = buildImportCategorySimilaritySignature(jefferson);
    const b = buildImportCategorySimilaritySignature(maria);

    expect(a?.kind).toBe("semantic_pattern");
    expect(a?.key).toBe(b?.key);
    expect(a?.key).toBe("income:semantic:transferencia_recebida");
    expect(a?.reason).toBe("Similar por padrão: transferência recebida");
    expect(a?.strength).toBe("high");
  });

  it("never mixes income and expense for the same semantic pattern", () => {
    const received = buildRow({
      sourceLine: 1,
      description: "Transferência recebida - Jefferson",
      direction: "in",
      kind: "bank_income",
    });
    const sent = buildRow({
      sourceLine: 2,
      description: "Transferência enviada - Maria",
      direction: "out",
      kind: "bank_transfer_out",
    });

    const receivedSig = buildImportCategorySimilaritySignature(received);
    const sentSig = buildImportCategorySimilaritySignature(sent);

    expect(receivedSig?.key).toBe("income:semantic:transferencia_recebida");
    expect(sentSig?.key).toBe("expense:semantic:transferencia_enviada");
    expect(receivedSig?.key).not.toBe(sentSig?.key);
  });

  it("marks cleaned-description signatures as low strength", () => {
    const row = buildRow({
      sourceLine: 1,
      description: "XYZ Compra Avulsa 998877",
      normalizedMerchant: "ab",
    });

    const signature = buildImportCategorySimilaritySignature(row);
    expect(signature?.kind).toBe("cleaned_description");
    expect(signature?.strength).toBe("low");
    expect(cleanDescriptionForSimilarity(row.description)).toBe(
      "xyz compra avulsa",
    );
  });

  it("formats similarity reasons for UI", () => {
    expect(formatImportCategorySimilarityReason("strong_prefix", "ifd")).toBe(
      "Similar por prefixo forte: IFD",
    );
    expect(
      formatImportCategorySimilarityReason(
        "semantic_pattern",
        "transferência enviada",
      ),
    ).toBe("Similar por padrão: transferência enviada");
  });
});
