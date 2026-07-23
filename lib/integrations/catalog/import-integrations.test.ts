import { describe, expect, it } from "vitest";

import {
  IMPORT_AVAILABILITY_LABELS,
  buildImportSourceLabels,
  formatPlannedImportBanksSummary,
  getImportLayoutBySource,
  getPlannedImportProviders,
  getSupportedImportBankSummaries,
  getSupportedImportProviders,
  getSupportedImportSources,
  getUnsupportedImportFileMessage,
  isSupportedImportSource,
} from "./import-integrations";

describe("import integrations catalog", () => {
  it("exposes Nubank, Inter, Bradesco and C6 checking as supported layouts", () => {
    const sources = getSupportedImportSources();
    expect(sources).toEqual(
      expect.arrayContaining([
        "nubank_checking",
        "nubank_credit_card",
        "inter_checking",
        "bradesco_checking",
        "c6_checking",
      ]),
    );
    expect(sources).toHaveLength(5);

    expect(getImportLayoutBySource("c6_checking")).toMatchObject({
      status: "supported",
      shortLabel: "conta",
      label: "C6 Bank — Conta corrente",
    });
  });

  it("lists supported banks for the import UI", () => {
    expect(getSupportedImportProviders().map((entry) => entry.id).sort()).toEqual(
      ["bradesco", "c6", "inter", "nubank"],
    );
    expect(getSupportedImportBankSummaries()).toEqual(
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
        {
          id: "bradesco",
          name: "Bradesco",
          layouts: ["Extrato de conta corrente"],
        },
        {
          id: "c6",
          name: "C6 Bank",
          layouts: ["Extrato de conta corrente"],
        },
      ]),
    );
  });

  it("keeps Itaú planned without unlocking sources", () => {
    const planned = getPlannedImportProviders();
    expect(planned.map((entry) => entry.id)).toEqual(["itau"]);
    expect(isSupportedImportSource("itau_checking")).toBe(false);
    expect(formatPlannedImportBanksSummary()).toBe("Itaú");
  });

  it("builds source labels and unsupported copy from the catalog", () => {
    expect(buildImportSourceLabels()).toEqual({
      nubank_checking: "Nubank — Conta corrente",
      nubank_credit_card: "Nubank — Cartão de crédito",
      inter_checking: "Inter — Conta corrente",
      bradesco_checking: "Bradesco — Conta corrente",
      c6_checking: "C6 Bank — Conta corrente",
    });
    expect(getUnsupportedImportFileMessage()).toContain("C6 Bank");
    expect(getUnsupportedImportFileMessage()).toContain("Disponível hoje");
    expect(IMPORT_AVAILABILITY_LABELS.supported).toBe("Disponível hoje");
    expect(IMPORT_AVAILABILITY_LABELS.planned).toBe("Em breve");
  });
});
