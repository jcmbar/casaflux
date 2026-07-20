import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { detectImportSource } from "./detect-source";
import {
  identifyImportFile,
  SUPPORTED_IMPORT_BANKS,
  SUPPORTED_IMPORT_FILE_TIP,
  UNSUPPORTED_IMPORT_FILE_MESSAGE,
} from "./identify-import-file";
import {
  getSupportedImportBankSummaries,
  getSupportedImportFileTip,
  getUnsupportedImportFileMessage,
} from "../catalog/import-integrations";

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

describe("identifyImportFile", () => {
  it("identifies a compatible Nubank checking CSV", () => {
    expect(detectImportSource(CHECKING_FIXTURE)).toBe("nubank_checking");

    const identified = identifyImportFile(CHECKING_FIXTURE);

    expect(identified).toEqual({
      status: "supported",
      canContinue: true,
      source: "nubank_checking",
      institutionId: "nubank",
      institutionName: "Nubank",
      layoutLabel: "Nubank — Conta corrente",
      headline: "Arquivo identificado: Nubank",
    });
  });

  it("identifies a compatible Nubank credit card CSV", () => {
    expect(detectImportSource(CARD_FIXTURE)).toBe("nubank_credit_card");

    const identified = identifyImportFile(CARD_FIXTURE);

    expect(identified).toEqual({
      status: "supported",
      canContinue: true,
      source: "nubank_credit_card",
      institutionId: "nubank",
      institutionName: "Nubank",
      layoutLabel: "Nubank — Cartão de crédito",
      headline: "Arquivo identificado: Nubank",
    });
  });

  it("blocks incompatible files with a friendly message", () => {
    const identified = identifyImportFile("banco,data,valor\n1,2,3");

    expect(identified.status).toBe("unsupported");
    expect(identified.canContinue).toBe(false);
    expect(identified.source).toBeNull();
    if (identified.status === "unsupported") {
      expect(identified.message).toBe(getUnsupportedImportFileMessage());
      expect(identified.tip).toBe(getSupportedImportFileTip());
      expect(identified.headline).toBe("Arquivo ainda não compatível");
    }
  });

  it("lists supported banks from the import catalog", () => {
    expect(SUPPORTED_IMPORT_BANKS).toEqual(getSupportedImportBankSummaries());
    expect(UNSUPPORTED_IMPORT_FILE_MESSAGE).toBe(
      getUnsupportedImportFileMessage(),
    );
    expect(SUPPORTED_IMPORT_FILE_TIP).toBe(getSupportedImportFileTip());
    expect(SUPPORTED_IMPORT_BANKS).toEqual(
      expect.arrayContaining([
        {
          id: "nubank",
          name: "Nubank",
          layouts: [
            "Extrato de conta corrente",
            "Extrato de cartão de crédito",
          ],
        },
        {
          id: "inter",
          name: "Inter",
          layouts: ["Extrato de conta corrente"],
        },
      ]),
    );
  });
});
