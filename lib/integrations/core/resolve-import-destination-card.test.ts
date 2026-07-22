import { describe, expect, it } from "vitest";

import { resolveImportDestinationCardAccountId } from "@/lib/integrations/core/resolve-import-destination-card";

describe("resolveImportDestinationCardAccountId", () => {
  it("returns empty when there are no credit cards", () => {
    expect(
      resolveImportDestinationCardAccountId({
        creditCardAccountIds: [],
        currentCardAccountId: "card-1",
      }),
    ).toBe("");
  });

  it("auto-selects the only credit card", () => {
    expect(
      resolveImportDestinationCardAccountId({
        creditCardAccountIds: ["card-1"],
        currentCardAccountId: "",
      }),
    ).toBe("card-1");

    expect(
      resolveImportDestinationCardAccountId({
        creditCardAccountIds: ["card-1"],
        currentCardAccountId: "stale",
      }),
    ).toBe("card-1");
  });

  it("keeps a valid selection when there are multiple cards", () => {
    expect(
      resolveImportDestinationCardAccountId({
        creditCardAccountIds: ["card-1", "card-2"],
        currentCardAccountId: "card-2",
      }),
    ).toBe("card-2");
  });

  it("clears an invalid selection when there are multiple cards", () => {
    expect(
      resolveImportDestinationCardAccountId({
        creditCardAccountIds: ["card-1", "card-2"],
        currentCardAccountId: "gone",
      }),
    ).toBe("");

    expect(
      resolveImportDestinationCardAccountId({
        creditCardAccountIds: ["card-1", "card-2"],
        currentCardAccountId: "",
      }),
    ).toBe("");
  });
});
