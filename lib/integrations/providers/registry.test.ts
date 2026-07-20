import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isSupportedImportSource } from "../catalog/import-integrations";
import {
  detectImportSource,
  getImportSourceProvider,
  getRegisteredImportIntegrations,
  getRegisteredImportSourceProviders,
  hasImportSourceProvider,
  resolveImportSourceProvider,
} from "./registry";
import {
  bradescoCheckingImportProvider,
  bradescoImportIntegration,
} from "./bradesco/provider";
import {
  interCheckingImportProvider,
  interImportIntegration,
} from "./inter/provider";
import {
  nubankCheckingImportProvider,
  nubankCreditCardImportProvider,
  nubankImportIntegration,
} from "./nubank/provider";
import type { ImportSourceProvider } from "./types";

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

const BRADESCO_FIXTURE = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/bradesco/bradesco_checking_sample.csv",
  ),
  "utf8",
);

const INTER_FIXTURE = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/inter/inter_checking_sample.csv",
  ),
  "utf8",
);

function expectProviderContract(provider: ImportSourceProvider) {
  expect(provider.source).toEqual(expect.any(String));
  expect(provider.providerId).toEqual(expect.any(String));
  expect(typeof provider.requiresCardAccount).toBe("boolean");
  expect(typeof provider.matches).toBe("function");
  expect(typeof provider.parse).toBe("function");
  expect(isSupportedImportSource(provider.source)).toBe(true);
  expect(hasImportSourceProvider(provider.source)).toBe(true);
}

describe("import source provider contract", () => {
  it("registers Nubank, Inter and Bradesco layouts that satisfy the provider contract", () => {
    expect(getRegisteredImportIntegrations()).toEqual([
      nubankImportIntegration,
      interImportIntegration,
      bradescoImportIntegration,
    ]);

    const providers = getRegisteredImportSourceProviders();
    expect(providers.map((provider) => provider.source).sort()).toEqual([
      "bradesco_checking",
      "inter_checking",
      "nubank_checking",
      "nubank_credit_card",
    ]);

    for (const provider of providers) {
      expectProviderContract(provider);
    }
  });

  it("lets the Nubank credit-card provider match and parse fixtures", () => {
    expect(nubankCreditCardImportProvider.matches(CARD_FIXTURE)).toBe(true);
    expect(nubankCreditCardImportProvider.matches(CHECKING_FIXTURE)).toBe(
      false,
    );

    const parsed = nubankCreditCardImportProvider.parse({
      content: CARD_FIXTURE,
      cardAccountId: "card-1",
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.every((row) => row.source === "nubank_credit_card")).toBe(
      true,
    );
  });

  it("lets the Nubank checking provider match and parse fixtures", () => {
    expect(nubankCheckingImportProvider.matches(CHECKING_FIXTURE)).toBe(true);
    expect(nubankCheckingImportProvider.matches(CARD_FIXTURE)).toBe(false);

    const parsed = nubankCheckingImportProvider.parse({
      content: CHECKING_FIXTURE,
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.every((row) => row.source === "nubank_checking")).toBe(
      true,
    );
  });

  it("lets the Bradesco checking provider match and parse fixtures", () => {
    expect(bradescoCheckingImportProvider.matches(BRADESCO_FIXTURE)).toBe(true);
    expect(bradescoCheckingImportProvider.matches(CARD_FIXTURE)).toBe(false);
    expect(bradescoCheckingImportProvider.matches(INTER_FIXTURE)).toBe(false);
    expect(bradescoCheckingImportProvider.matches(CHECKING_FIXTURE)).toBe(false);

    const parsed = bradescoCheckingImportProvider.parse({
      content: BRADESCO_FIXTURE,
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows.every((row) => row.source === "bradesco_checking")).toBe(
      true,
    );
  });

  it("resolves identification through the registry and blocks unknown files", () => {
    expect(detectImportSource(CARD_FIXTURE)).toBe("nubank_credit_card");
    expect(detectImportSource(CHECKING_FIXTURE)).toBe("nubank_checking");
    expect(detectImportSource(INTER_FIXTURE)).toBe("inter_checking");
    expect(detectImportSource(BRADESCO_FIXTURE)).toBe("bradesco_checking");
    expect(detectImportSource("foo,bar\n1,2")).toBeNull();

    expect(resolveImportSourceProvider(CARD_FIXTURE)?.source).toBe(
      "nubank_credit_card",
    );
    expect(resolveImportSourceProvider("foo,bar\n1,2")).toBeNull();

    expect(getImportSourceProvider("nubank_checking")).toBe(
      nubankCheckingImportProvider,
    );
    expect(getImportSourceProvider("bradesco_checking")).toBe(
      bradescoCheckingImportProvider,
    );
    expect(hasImportSourceProvider("nubank_credit_card")).toBe(true);
  });

  it("does not expose providers for planned catalog banks", () => {
    const sources = getRegisteredImportSourceProviders().map(
      (provider) => provider.source,
    );
    expect(sources.some((source) => source.includes("itau"))).toBe(false);
    expect(sources).toContain("inter_checking");
    expect(sources).toContain("bradesco_checking");
    expect(interCheckingImportProvider.providerId).toBe("inter");
    expect(bradescoCheckingImportProvider.providerId).toBe("bradesco");
  });
});
