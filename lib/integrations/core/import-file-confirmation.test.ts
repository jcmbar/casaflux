import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportFileConfirmation } from "./import-file-confirmation";
import { identifyImportFile } from "./identify-import-file";

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
          value: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/),
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
          value: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/),
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
