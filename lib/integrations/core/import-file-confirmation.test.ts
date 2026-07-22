import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildImportFileConfirmation,
  formatImportFilePeriodLabel,
  getImportFileTransactionDateRange,
} from "./import-file-confirmation";
import { identifyImportFile } from "./identify-import-file";
import { buildStatementCycle } from "@/lib/finance/credit-card-billing";

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

function periodSignal(
  confirmation: ReturnType<typeof buildImportFileConfirmation>,
): string | undefined {
  return confirmation?.signals.find((signal) => signal.label === "Período")
    ?.value;
}

describe("buildImportFileConfirmation", () => {
  it("builds a confirmation summary for Nubank checking before preview", () => {
    const identified = identifyImportFile(CHECKING_FIXTURE);
    expect(identified.status).toBe("supported");
    if (identified.status !== "supported") return;

    const confirmation = buildImportFileConfirmation(
      CHECKING_FIXTURE,
      identified,
    );

    expect(confirmation).toMatchObject({
      source: "nubank_checking",
      institutionName: "Nubank",
      layoutShortLabel: "conta",
      headline: "Encontramos um CSV do Nubank — conta",
    });
    expect(confirmation?.signals).toEqual(
      expect.arrayContaining([
        {
          label: "Layout",
          value: "Extrato de conta corrente",
        },
        {
          label: "Movimentações",
          value: "24 linhas encontradas",
        },
        {
          label: "Período",
          value: "01/07/2026 a 19/07/2026",
        },
      ]),
    );
  });

  it("builds a confirmation summary for Nubank credit card before preview", () => {
    const identified = identifyImportFile(CARD_FIXTURE);
    expect(identified.status).toBe("supported");
    if (identified.status !== "supported") return;

    const confirmation = buildImportFileConfirmation(CARD_FIXTURE, identified);

    expect(confirmation).toMatchObject({
      source: "nubank_credit_card",
      institutionName: "Nubank",
      layoutShortLabel: "cartão",
      headline: "Encontramos um CSV do Nubank — cartão",
    });
    expect(confirmation?.signals).toEqual(
      expect.arrayContaining([
        {
          label: "Layout",
          value: "Extrato de cartão de crédito",
        },
        {
          label: "Movimentações",
          value: "59 linhas encontradas",
        },
        {
          label: "Período",
          // Exact min/max of CSV date column — not statement cycle 26/06–25/07.
          value: "24/06/2026 a 20/07/2026",
        },
      ]),
    );
  });

  it("does not build confirmation for incompatible files", () => {
    expect(buildImportFileConfirmation("foo,bar\n1,2")).toBeNull();

    const unsupported = identifyImportFile("banco,data\n1,2");
    expect(unsupported.status).toBe("unsupported");
    expect(buildImportFileConfirmation("banco,data\n1,2")).toBeNull();
  });
});

describe("getImportFileTransactionDateRange (PERÍODO)", () => {
  it("uses exact min/max transaction dates with no ±1 day shift", () => {
    const content = [
      "date,title,amount",
      '2026-05-25,Compra fim,"10,00"',
      '2026-05-01,Compra meio,"20,00"',
      '2026-04-23,Compra inicio,"30,00"',
    ].join("\n");

    const range = getImportFileTransactionDateRange(content);
    expect(range).toEqual({ from: "2026-04-23", to: "2026-05-25" });

    const identified = identifyImportFile(content);
    expect(identified.status).toBe("supported");
    if (identified.status !== "supported") return;

    expect(periodSignal(buildImportFileConfirmation(content, identified))).toBe(
      "23/04/2026 a 25/05/2026",
    );
  });

  it("shows a single day when all rows share the same date", () => {
    const content = [
      "date,title,amount",
      '2026-05-10,Unica,"10,00"',
      '2026-05-10,Outra,"20,00"',
    ].join("\n");

    expect(getImportFileTransactionDateRange(content)).toEqual({
      from: "2026-05-10",
      to: "2026-05-10",
    });
    expect(
      formatImportFilePeriodLabel({
        from: "2026-05-10",
        to: "2026-05-10",
      }),
    ).toBe("10/05/2026");
  });

  it("does not use statement-cycle periodStart/periodEnd for the label", () => {
    const content = [
      "date,title,amount",
      '2026-05-25,Fim,"10,00"',
      '2026-04-23,Inicio,"30,00"',
    ].join("\n");

    // Cycle for closing day 25 would be 26/04–25/05 (or window 24/04–25/05).
    const cycle = buildStatementCycle({
      closingDate: "2026-05-25",
      closingDay: 25,
      dueDay: 1,
    });
    expect(cycle.periodStart).toBe("2026-04-26");
    expect(cycle.periodEnd).toBe("2026-05-25");

    const range = getImportFileTransactionDateRange(content)!;
    const label = formatImportFilePeriodLabel(range);

    expect(label).toBe("23/04/2026 a 25/05/2026");
    expect(label).not.toContain("26/04/2026");
    expect(label).not.toBe("24/04/2026 a 24/05/2026");
    expect(range.from).not.toBe(cycle.periodStart);
  });

  it("keeps calendar dates when cells include a time suffix", () => {
    const content = [
      "date,title,amount",
      '2026-05-25T15:00:00,Compra fim,"10,00"',
      '2026-04-23T00:00:00,Compra inicio,"30,00"',
    ].join("\n");

    expect(getImportFileTransactionDateRange(content)).toEqual({
      from: "2026-04-23",
      to: "2026-05-25",
    });
  });
});
