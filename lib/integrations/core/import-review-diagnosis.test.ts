import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "./import-orchestrator";
import {
  buildImportReviewDiagnosis,
  formatImportReviewHeadline,
} from "./import-review-diagnosis";
import { withDefaultHistoricalRows } from "../history/compare-preview-with-history";
import type { ImportPreviewRow } from "../types";

const NUBANK_CARD = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/nubank/Nubank_2026-08-01.csv",
  ),
  "utf8",
);

const INTER_CHECKING = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/inter/inter_checking_sample.csv",
  ),
  "utf8",
);

describe("formatImportReviewHeadline", () => {
  it("formats ready and skipped counts in product language", () => {
    expect(
      formatImportReviewHeadline({ readyCount: 12, skippedCount: 2 }),
    ).toBe("12 lançamentos prontos para importar, 2 linhas ignoradas");
    expect(
      formatImportReviewHeadline({ readyCount: 1, skippedCount: 0 }),
    ).toBe("1 lançamento pronto para importar");
  });
});

describe("buildImportReviewDiagnosis", () => {
  it("builds a review summary for a Nubank credit card file", () => {
    const preview = buildImportPreview({
      content: NUBANK_CARD,
      cardAccountId: "card-1",
    });

    const diagnosis = buildImportReviewDiagnosis({
      rows: preview.rows,
      invoiceSourceAccounts: {},
    });

    expect(diagnosis.readyCount).toBeGreaterThan(0);
    expect(diagnosis.headline).toContain("prontos para importar");
    expect(diagnosis.kindBreakdown.some((item) => item.label === "Compra no cartão")).toBe(
      true,
    );
    expect(
      diagnosis.kindBreakdown.some((item) => item.label === "Pagamento de fatura"),
    ).toBe(true);

    // Invoice payment without source account is not ready.
    const payment = preview.rows.find(
      (row) => row.kind === "card_invoice_payment",
    );
    expect(payment).toBeTruthy();
    expect(diagnosis.skippedCount).toBeGreaterThanOrEqual(1);
    expect(
      diagnosis.attentionItems.some((item) => item.id === "needs_account"),
    ).toBe(true);
  });

  it("builds a review summary for an Inter checking file", () => {
    const preview = buildImportPreview({ content: INTER_CHECKING });
    const diagnosis = buildImportReviewDiagnosis({ rows: preview.rows });

    expect(diagnosis.readyCount).toBe(5);
    expect(diagnosis.skippedCount).toBe(0);
    expect(diagnosis.headline).toBe(
      "5 lançamentos prontos para importar",
    );
    expect(diagnosis.kindBreakdown.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Transferência enviada",
        "Entrada bancária",
        "Estorno",
      ]),
    );
  });

  it("keeps ignored counts consistent for already-imported rows", () => {
    const preview = buildImportPreview({ content: INTER_CHECKING });
    const rows: ImportPreviewRow[] = withDefaultHistoricalRows(preview.rows).map(
      (row, index) =>
        index === 0
          ? {
              ...row,
              historicalStatus: "already_imported",
              reviewStatus: "already_imported",
            }
          : row,
    );

    const diagnosis = buildImportReviewDiagnosis({ rows });
    expect(diagnosis.readyCount).toBe(4);
    expect(diagnosis.skippedCount).toBe(1);
    expect(diagnosis.headline).toBe(
      "4 lançamentos prontos para importar, 1 linha ignorada",
    );
    expect(
      diagnosis.attentionItems.some(
        (item) =>
          item.id === "already_imported" &&
          item.label.includes("parece já existir no Casaflux"),
      ),
    ).toBe(true);
  });
});
