import { describe, expect, it } from "vitest";

import {
  buildImportIntegrationHistorySummaries,
  formatImportIntegrationMetricsLabel,
  hasImportIntegrationHistoryActivity,
} from "./integration-summaries";

describe("buildImportIntegrationHistorySummaries", () => {
  it("summarizes Nubank, Inter and Bradesco committed imports separately", () => {
    const summaries = buildImportIntegrationHistorySummaries([
      {
        source: "nubank_credit_card",
        status: "committed",
        createdLaunchCount: 10,
        ignoredItemCount: 2,
        rowCount: 12,
      },
      {
        source: "nubank_checking",
        status: "committed",
        createdLaunchCount: 5,
        ignoredItemCount: 0,
        rowCount: 5,
      },
      {
        source: "inter_checking",
        status: "committed",
        createdLaunchCount: 3,
        ignoredItemCount: 1,
        rowCount: 4,
      },
      {
        source: "bradesco_checking",
        status: "committed",
        createdLaunchCount: 2,
        ignoredItemCount: 0,
        rowCount: 2,
      },
      {
        source: "nubank_checking",
        status: "failed",
        createdLaunchCount: 0,
        ignoredItemCount: 0,
        rowCount: 8,
      },
    ]);

    expect(summaries.map((item) => item.providerId).sort()).toEqual([
      "bradesco",
      "inter",
      "nubank",
    ]);
    expect(summaries.some((item) => item.providerId === "itau")).toBe(false);

    const nubank = summaries.find((item) => item.providerId === "nubank");
    expect(nubank).toMatchObject({
      title: "Importações Nubank",
      successfulImports: 2,
      totalImports: 3,
      createdLaunches: 15,
      ignoredItems: 2,
      fileRows: 17,
    });
    expect(nubank?.metricsLabel).toContain("2 arquivos");
    expect(nubank?.metricsLabel).toContain("15 lançamentos");

    const inter = summaries.find((item) => item.providerId === "inter");
    expect(inter).toMatchObject({
      title: "Importações Inter",
      successfulImports: 1,
      createdLaunches: 3,
      ignoredItems: 1,
    });

    const bradesco = summaries.find((item) => item.providerId === "bradesco");
    expect(bradesco).toMatchObject({
      title: "Importações Bradesco",
      successfulImports: 1,
      createdLaunches: 2,
      ignoredItems: 0,
    });
  });

  it("still lists supported banks with zero history", () => {
    const summaries = buildImportIntegrationHistorySummaries([]);
    expect(summaries).toHaveLength(3);
    expect(summaries.every((item) => item.successfulImports === 0)).toBe(true);
    expect(summaries[0]?.metricsLabel).toBe(
      "Nenhuma importação concluída ainda",
    );
  });

  it("does not treat planned banks as supported summaries", () => {
    const summaries = buildImportIntegrationHistorySummaries([]);
    expect(summaries.map((item) => item.name).sort()).toEqual([
      "Bradesco",
      "Inter",
      "Nubank",
    ]);
  });
});

describe("hasImportIntegrationHistoryActivity", () => {
  it("is false for empty history and true when any bank has imports", () => {
    const empty = buildImportIntegrationHistorySummaries([]);
    expect(hasImportIntegrationHistoryActivity(empty)).toBe(false);

    const withHistory = buildImportIntegrationHistorySummaries([
      {
        source: "inter_checking",
        status: "committed",
        createdLaunchCount: 1,
        ignoredItemCount: 0,
        rowCount: 1,
      },
    ]);
    expect(hasImportIntegrationHistoryActivity(withHistory)).toBe(true);
  });
});

describe("formatImportIntegrationMetricsLabel", () => {
  it("formats empty and populated metrics in product language", () => {
    expect(
      formatImportIntegrationMetricsLabel({
        successfulImports: 0,
        createdLaunches: 0,
        ignoredItems: 0,
      }),
    ).toBe("Nenhuma importação concluída ainda");

    expect(
      formatImportIntegrationMetricsLabel({
        successfulImports: 1,
        createdLaunches: 4,
        ignoredItems: 0,
      }),
    ).toBe("1 arquivo · 4 lançamentos criados");

    expect(
      formatImportIntegrationMetricsLabel({
        successfulImports: 2,
        createdLaunches: 9,
        ignoredItems: 3,
      }),
    ).toBe("2 arquivos · 9 lançamentos criados · 3 linhas ignoradas");
  });
});
