import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "../../core/import-orchestrator";
import { buildImportFileConfirmation } from "../../core/import-file-confirmation";
import { identifyImportFile } from "../../core/identify-import-file";
import {
  getCommittableImportRows,
  isImportRowCommittable,
  mapImportRowToTransactions,
} from "../../commit/map-import-row";
import {
  matchesInterCheckingHeader,
  parseInterCheckingAmount,
  parseInterCheckingCsv,
} from "./checking-parser";

const FIXTURE = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/inter/inter_checking_sample.csv",
  ),
  "utf8",
);

describe("parseInterCheckingCsv", () => {
  it("matches the Inter checking header and parses the fixture", () => {
    expect(matchesInterCheckingHeader(FIXTURE)).toBe(true);
    expect(matchesInterCheckingHeader("date,title,amount\n1,2,3")).toBe(false);

    const result = parseInterCheckingCsv(FIXTURE);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.source === "inter_checking")).toBe(
      true,
    );
    expect(result.rows.every((row) => row.reviewStatus === "ready")).toBe(true);
    expect(result.rows.some((row) => row.kind === "bank_transfer_out")).toBe(
      true,
    );
    expect(result.rows.some((row) => row.kind === "bank_income")).toBe(true);
    expect(result.rows.some((row) => row.kind === "bank_reversal")).toBe(true);
  });

  it("parses Brazilian amounts with direction from sign", () => {
    expect(parseInterCheckingAmount("-150,00")).toEqual({
      amount: 150,
      direction: "out",
    });
    expect(parseInterCheckingAmount("1.234,56")).toEqual({
      amount: 1234.56,
      direction: "in",
    });
  });
});

describe("Inter checking import flow", () => {
  it("identifies and confirms Inter checking files", () => {
    const identified = identifyImportFile(FIXTURE);
    expect(identified).toMatchObject({
      status: "supported",
      canContinue: true,
      source: "inter_checking",
      institutionId: "inter",
      institutionName: "Inter",
      layoutLabel: "Inter — Conta corrente",
    });

    if (identified.status !== "supported") return;

    const confirmation = buildImportFileConfirmation(FIXTURE, identified);
    expect(confirmation).toMatchObject({
      source: "inter_checking",
      institutionName: "Inter",
      layoutShortLabel: "conta",
      headline: "Encontramos um CSV do Inter — conta",
    });
    expect(confirmation?.signals).toEqual(
      expect.arrayContaining([
        {
          label: "Layout",
          value: "Extrato de conta corrente",
        },
        {
          label: "Movimentações",
          value: "5 linhas encontradas",
        },
      ]),
    );
  });

  it("builds a preview with committable normalized rows", () => {
    const preview = buildImportPreview({ content: FIXTURE });
    expect(preview.source).toBe("inter_checking");
    expect(preview.rows).toHaveLength(5);
    expect(preview.parseErrors).toEqual([]);

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
