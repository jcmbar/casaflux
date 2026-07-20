import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "../../core/import-orchestrator";
import { buildImportFileConfirmation } from "../../core/import-file-confirmation";
import { identifyImportFile } from "../../core/identify-import-file";
import { buildImportDuplicateAttention } from "../../core/import-duplicate-attention";
import { buildImportReviewDiagnosis } from "../../core/import-review-diagnosis";
import {
  getCommittableImportRows,
  isImportRowCommittable,
  mapImportRowToTransactions,
} from "../../commit/map-import-row";
import {
  BRADESCO_UNTRUSTED_IMPORT_MESSAGE,
  looksLikeUntrustedBradescoChecking,
  matchesBradescoCheckingHeader,
  normalizeBradescoDate,
  parseBradescoCheckingAmount,
  parseBradescoCheckingCsv,
} from "./checking-parser";

const FIXTURE = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/bradesco/bradesco_checking_sample.csv",
  ),
  "utf8",
);

describe("parseBradescoCheckingCsv", () => {
  it("matches the trusted Bradesco checking header and parses the fixture", () => {
    expect(matchesBradescoCheckingHeader(FIXTURE)).toBe(true);
    expect(matchesBradescoCheckingHeader("date,title,amount\n1,2,3")).toBe(
      false,
    );

    const result = parseBradescoCheckingCsv(FIXTURE);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.source === "bradesco_checking")).toBe(
      true,
    );
    expect(result.rows.every((row) => row.reviewStatus === "ready")).toBe(true);
    expect(result.rows.some((row) => row.kind === "bank_transfer_out")).toBe(
      true,
    );
    expect(result.rows.some((row) => row.kind === "bank_income")).toBe(true);
    expect(result.rows.some((row) => row.kind === "bank_reversal")).toBe(true);
    expect(result.rows.every((row) => row.externalId?.startsWith("DOC"))).toBe(
      true,
    );
  });

  it("parses Brazilian amounts and two-digit dates safely", () => {
    expect(parseBradescoCheckingAmount("1.234,56")).toBe(1234.56);
    expect(parseBradescoCheckingAmount("150,00")).toBe(150);
    expect(normalizeBradescoDate("01/07/26")).toBe("2026-07-01");
    expect(normalizeBradescoDate("01/07/2026")).toBe("2026-07-01");
  });

  it("blocks ambiguous amount rows instead of guessing", () => {
    const content = [
      "Data;Histórico;Docto.;Crédito;Débito;Saldo",
      "01/07/26;PIX ENVIADO;DOC1;10,00;10,00;0,00",
      "02/07/26;PIX RECEBIDO;DOC2;;;100,00",
    ].join("\n");

    const result = parseBradescoCheckingCsv(content);
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });
});

describe("untrusted Bradesco detection", () => {
  it("flags Bradesco-looking files without the trusted header", () => {
    const untrusted = [
      "Extrato de: Ag: 1234 | Conta: 56789-0 | Entre 01/07/2026 e 10/07/2026",
      "Data;Descricao;Valor",
      "01/07/26;PIX;150,00",
    ].join("\n");

    expect(matchesBradescoCheckingHeader(untrusted)).toBe(false);
    expect(looksLikeUntrustedBradescoChecking(untrusted)).toBe(true);

    const identified = identifyImportFile(untrusted);
    expect(identified).toMatchObject({
      status: "unsupported",
      canContinue: false,
      headline: "Arquivo do Bradesco ainda não confiável",
      message: BRADESCO_UNTRUSTED_IMPORT_MESSAGE,
    });
  });
});

describe("Bradesco checking import flow", () => {
  it("identifies and confirms Bradesco checking files", () => {
    const identified = identifyImportFile(FIXTURE);
    expect(identified).toMatchObject({
      status: "supported",
      canContinue: true,
      source: "bradesco_checking",
      institutionId: "bradesco",
      institutionName: "Bradesco",
      layoutLabel: "Bradesco — Conta corrente",
    });

    if (identified.status !== "supported") return;

    const confirmation = buildImportFileConfirmation(FIXTURE, identified);
    expect(confirmation).toMatchObject({
      source: "bradesco_checking",
      institutionName: "Bradesco",
      layoutShortLabel: "conta",
      headline: "Encontramos um CSV do Bradesco — conta",
    });
    expect(confirmation?.signals).toEqual(
      expect.arrayContaining([
        {
          label: "Layout",
          value: "Extrato de conta corrente",
        },
      ]),
    );
  });

  it("builds a preview with diagnosis, duplicates, and safe commit rows", () => {
    const preview = buildImportPreview({ content: FIXTURE });
    expect(preview.source).toBe("bradesco_checking");
    expect(preview.rows).toHaveLength(5);
    expect(preview.parseErrors).toEqual([]);

    const diagnosis = buildImportReviewDiagnosis({ rows: preview.rows });
    expect(diagnosis.readyCount).toBe(5);
    expect(diagnosis.skippedCount).toBe(0);
    expect(diagnosis.headline).toContain("prontos para importar");

    const duplicateContent = [
      "Data;Histórico;Docto.;Crédito;Débito;Saldo",
      "01/07/26;PIX ENVIADO JOAO;DUP1;;150,00;1.000,00",
      "02/07/26;PIX ENVIADO MARIA;DUP1;;200,00;800,00",
      "03/07/26;PIX RECEBIDO;UNIQUE;50,00;;850,00",
    ].join("\n");
    const duplicatePreview = buildImportPreview({ content: duplicateContent });
    expect(duplicatePreview.summary.countsByReviewStatus.possible_duplicate).toBe(
      1,
    );

    const attention = buildImportDuplicateAttention({
      rows: duplicatePreview.rows,
      possibleDuplicates: duplicatePreview.possibleDuplicates,
      committableSourceLines: new Set(
        getCommittableImportRows(duplicatePreview.rows, {}).map(
          (row) => row.sourceLine,
        ),
      ),
    });
    expect(attention?.intraFileCount).toBe(1);
    expect(attention?.groups[0]?.reasonCode).toBe("same_bank_id_in_file");

    const committable = getCommittableImportRows(preview.rows, {}, {});
    expect(committable.length).toBe(5);

    for (const row of preview.rows) {
      expect(isImportRowCommittable(row, {}, {})).toBe(true);
      const drafts = mapImportRowToTransactions(row, "account-1");
      expect(drafts).toHaveLength(1);
      expect(drafts[0]?.accountId).toBe("account-1");
      expect(["income", "expense"]).toContain(drafts[0]?.type);
    }
  });
});
