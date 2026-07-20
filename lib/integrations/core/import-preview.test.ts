import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "./import-orchestrator";
import { detectImportSource } from "./detect-source";
import { getImportWarnings, summarizeImportPreview } from "./preview";

const FIXTURES_DIR = path.join(
  process.cwd(),
  "lib/integrations/__fixtures__/nubank",
);

const CARD_FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "Nubank_2026-08-01.csv"),
  "utf8",
);

const CHECKING_FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "NU_74988370_01JUL2026_19JUL2026.csv"),
  "utf8",
);

const CARD_ACCOUNT_ID = "fixture-card-account";

describe("detectImportSource", () => {
  it("detects credit card and checking fixtures", () => {
    expect(detectImportSource(CARD_FIXTURE)).toBe("nubank_credit_card");
    expect(detectImportSource(CHECKING_FIXTURE)).toBe("nubank_checking");
  });

  it("returns null for unknown headers", () => {
    expect(detectImportSource("foo,bar\n1,2")).toBeNull();
  });
});

describe("buildImportPreview", () => {
  it("builds a consolidated credit card preview from the real fixture", () => {
    const preview = buildImportPreview({
      content: CARD_FIXTURE,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    expect(preview.source).toBe("nubank_credit_card");
    expect(preview.rows).toHaveLength(59);
    expect(preview.parseErrors).toEqual([]);
    expect(preview.summary.totalRows).toBe(59);
    expect(preview.summary.countsByKind.card_purchase).toBe(54);
    expect(preview.summary.countsByKind.card_fee).toBe(4);
    expect(preview.summary.countsByKind.card_invoice_payment).toBe(1);
    expect(preview.summary.countsByReviewStatus.ready).toBe(58);
    expect(preview.summary.countsByReviewStatus.needs_account).toBe(1);
    expect(preview.possibleDuplicates).toEqual([]);
  });

  it("marks Pagamento recebido as needs_account in needsReview", () => {
    const preview = buildImportPreview({
      content: CARD_FIXTURE,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const paymentRow = preview.rows.find(
      (row) => row.description === "Pagamento recebido",
    );

    expect(paymentRow?.kind).toBe("card_invoice_payment");
    expect(paymentRow?.reviewStatus).toBe("needs_account");
    expect(preview.needsReview).toHaveLength(1);
    expect(preview.needsReview[0]?.description).toBe("Pagamento recebido");
  });

  it("builds a consolidated checking preview from the real fixture", () => {
    const preview = buildImportPreview({ content: CHECKING_FIXTURE });

    expect(preview.source).toBe("nubank_checking");
    expect(preview.rows).toHaveLength(24);
    expect(preview.summary.countsByKind.bank_income).toBe(7);
    expect(preview.summary.countsByKind.bank_expense).toBe(2);
    expect(preview.summary.countsByKind.bank_transfer_out).toBe(14);
    expect(preview.summary.countsByKind.bank_reversal).toBe(1);
    expect(preview.summary.countsByReviewStatus.ready).toBe(24);
    expect(preview.possibleDuplicates).toEqual([]);
  });

  it("links reversal pairs with warning while keeping both rows ready", () => {
    const preview = buildImportPreview({ content: CHECKING_FIXTURE });
    const reversalUuid = "6a5cff73-490e-4f8e-8e67-953f71d273d1";
    const pairRows = preview.rows.filter((row) => row.externalId === reversalUuid);

    expect(pairRows).toHaveLength(2);
    expect(pairRows.every((row) => row.reviewStatus === "ready")).toBe(true);
    expect(
      preview.warnings.some(
        (warning) =>
          warning.code === "reversal_pair" && warning.externalId === reversalUuid,
      ),
    ).toBe(true);
    expect(preview.needsReview).toHaveLength(0);
  });

  it("detects intra-file card duplicates from a synthetic fixture", () => {
    const content = [
      "date,title,amount",
      '2026-07-01,Test Store,"10,00"',
      '2026-07-01,Test Store,"10,00"',
      '2026-07-02,Test Store - Parcela 1/3,"10,00"',
      '2026-07-02,Test Store - Parcela 2/3,"10,00"',
    ].join("\n");

    const preview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    expect(preview.rows).toHaveLength(4);
    expect(preview.summary.countsByReviewStatus.possible_duplicate).toBe(1);
    expect(preview.possibleDuplicates).toHaveLength(1);
    expect(preview.possibleDuplicates[0]?.sourceLines).toEqual([2, 3]);
    expect(preview.needsReview).toHaveLength(1);
    expect(preview.needsReview[0]?.sourceLine).toBe(3);
  });

  it("detects intra-file checking duplicates except known reversal pairs", () => {
    const content = [
      "Data,Valor,Identificador,Descrição",
      "01/07/2026,-10.00,duplicate-id-1,Transferência enviada pelo Pix - Foo",
      "02/07/2026,-20.00,duplicate-id-1,Transferência enviada pelo Pix - Bar",
      "19/07/2026,-6.75,reversal-id,Transferência enviada pelo Pix - Baz",
      "19/07/2026,6.75,reversal-id,Estorno - Transferência enviada pelo Pix - Baz",
    ].join("\n");

    const preview = buildImportPreview({ content });

    expect(preview.summary.countsByReviewStatus.possible_duplicate).toBe(1);
    expect(preview.possibleDuplicates).toHaveLength(1);
    expect(preview.possibleDuplicates[0]?.key).toBe("externalId:duplicate-id-1");

    const reversalRows = preview.rows.filter((row) => row.externalId === "reversal-id");
    expect(reversalRows.every((row) => row.reviewStatus === "ready")).toBe(true);
    expect(
      preview.warnings.some(
        (warning) =>
          warning.code === "reversal_pair" && warning.externalId === "reversal-id",
      ),
    ).toBe(true);
  });

  it("returns unsupported preview for unknown files", () => {
    const preview = buildImportPreview({ content: "unknown,header\n1,2" });

    expect(preview.source).toBeNull();
    expect(preview.rows).toEqual([]);
    expect(preview.warnings[0]?.code).toBe("unsupported_source");
    expect(preview.warnings[0]?.message).toContain("CSV de Nubank, Inter, Bradesco");
    expect(preview.parseErrors).toHaveLength(1);
  });
});

describe("preview helpers", () => {
  it("summarizeImportPreview reflects warning and duplicate counts", () => {
    const preview = buildImportPreview({ content: CHECKING_FIXTURE });
    const summary = summarizeImportPreview(preview);

    expect(summary.warningCount).toBe(preview.warnings.length);
    expect(summary.duplicateGroupCount).toBe(preview.possibleDuplicates.length);
    expect(getImportWarnings(preview.rows, preview.parseErrors)).toEqual(
      preview.warnings,
    );
  });
});
