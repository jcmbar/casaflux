import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "../../core/import-orchestrator";
import { buildImportFileConfirmation } from "../../core/import-file-confirmation";
import { identifyImportFile } from "../../core/identify-import-file";
import {
  getCommittableImportRows,
} from "../../commit/map-import-row";
import {
  matchesC6CheckingHeader,
  parseC6CheckingCsv,
  parseC6Money,
  resolveC6DirectionAndAmount,
} from "./checking-parser";

const FIXTURE = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/c6/c6_checking_sample.csv",
  ),
  "utf8",
);

describe("parseC6CheckingCsv", () => {
  it("matches the C6 checking header after metadata and parses the fixture", () => {
    expect(matchesC6CheckingHeader(FIXTURE)).toBe(true);
    expect(matchesC6CheckingHeader("date,title,amount\n1,2,3")).toBe(false);

    const result = parseC6CheckingCsv(FIXTURE);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.source === "c6_checking")).toBe(true);
    expect(result.rows.every((row) => row.reviewStatus === "ready")).toBe(true);

    const parking = result.rows[0]!;
    expect(parking).toMatchObject({
      date: "2026-07-04",
      direction: "out",
      amount: 14,
      kind: "bank_expense",
    });
    expect(parking.description).toContain("C6TAG ESTACIONAMENTO");
    expect(parking.metadata.balanceAfter).toBe(655.56);
    expect(parking.metadata.accountingDate).toBe("2026-07-06");

    const income = result.rows.find((row) => row.direction === "in");
    expect(income).toMatchObject({
      date: "2026-03-15",
      amount: 1380.5,
      kind: "bank_income",
      description: "RES DE CDB VENC",
    });
  });

  it("parses US and BR money cells and resolves Entrada/Saída", () => {
    expect(parseC6Money("1.234,56")).toBe(1234.56);
    expect(parseC6Money("1380.50")).toBe(1380.5);
    expect(parseC6Money("0.00")).toBe(0);

    expect(
      resolveC6DirectionAndAmount({ entradaRaw: "100.00", saidaRaw: "0.00" }),
    ).toEqual({ amount: 100, direction: "in" });
    expect(
      resolveC6DirectionAndAmount({ entradaRaw: "0.00", saidaRaw: "18.00" }),
    ).toEqual({ amount: 18, direction: "out" });
  });

  it("skips empty and footer-like lines without failing the batch", () => {
    const content = `${FIXTURE}\n\nTOTAL,,,,0.00,0.00,\n`;
    const result = parseC6CheckingCsv(content);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);
  });
});

describe("C6 checking import flow", () => {
  it("identifies and confirms C6 checking files", () => {
    const identified = identifyImportFile(FIXTURE);
    expect(identified).toMatchObject({
      status: "supported",
      canContinue: true,
      source: "c6_checking",
      institutionId: "c6",
      institutionName: "C6 Bank",
      layoutLabel: "C6 Bank — Conta corrente",
    });

    if (identified.status !== "supported") return;

    const confirmation = buildImportFileConfirmation(FIXTURE, identified);
    expect(confirmation).toMatchObject({
      source: "c6_checking",
      institutionName: "C6 Bank",
      layoutShortLabel: "conta",
      headline: "Encontramos um CSV do C6 Bank — conta",
    });
  });

  it("builds a preview with committable normalized rows", () => {
    const preview = buildImportPreview({ content: FIXTURE });
    expect(preview.source).toBe("c6_checking");
    expect(preview.rows).toHaveLength(5);
    expect(preview.parseErrors).toEqual([]);

    const committable = getCommittableImportRows(preview.rows, {}, {});
    expect(committable.length).toBe(5);
  });
});
