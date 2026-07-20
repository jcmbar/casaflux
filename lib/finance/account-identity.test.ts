import { describe, expect, it } from "vitest";

import { formatAccountSelectLabel } from "./account-identity";

describe("formatAccountSelectLabel", () => {
  it("keeps unmapped account names without inventing a brand", () => {
    expect(
      formatAccountSelectLabel({
        name: "Carteira",
        type: "cash",
      }),
    ).toBe("Carteira");
  });

  it("avoids duplicating brand when account name is the institution", () => {
    expect(
      formatAccountSelectLabel(
        { name: "Nubank", type: "checking" },
        { includeType: true },
      ),
    ).toBe("Nubank · Conta corrente");
  });

  it("adds institution hint for names that contain the brand", () => {
    expect(
      formatAccountSelectLabel({
        name: "Cartão Nubank",
        type: "credit_card",
      }),
    ).toBe("Cartão Nubank · Nubank");
  });

  it("resolves roxinho alias to Nubank identity hint", () => {
    expect(
      formatAccountSelectLabel({
        name: "Cartão Roxinho",
        type: "credit_card",
      }),
    ).toBe("Cartão Roxinho · Nubank");
  });
});
