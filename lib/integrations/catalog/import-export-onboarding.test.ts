import { describe, expect, it } from "vitest";

import {
  buildImportCsvOnboardingCards,
  getPlannedImportCsvOnboardingCards,
  getSupportedImportCsvOnboardingCards,
} from "./import-export-onboarding";

describe("import CSV onboarding catalog", () => {
  it("lists Nubank, Inter and Bradesco as supported with export steps", () => {
    const supported = getSupportedImportCsvOnboardingCards();
    expect(supported.map((card) => card.providerId).sort()).toEqual([
      "bradesco",
      "inter",
      "nubank",
    ]);

    for (const card of supported) {
      expect(card.status).toBe("supported");
      const readyLayouts = card.layouts.filter(
        (layout) => layout.status === "supported",
      );
      expect(readyLayouts.length).toBeGreaterThan(0);
      expect(
        readyLayouts.every(
          (layout) => layout.steps != null && layout.steps.length > 0,
        ),
      ).toBe(true);
    }

    const nubank = supported.find((card) => card.providerId === "nubank");
    expect(nubank?.layouts.map((layout) => layout.kind).sort()).toEqual([
      "checking",
      "credit_card",
    ]);
  });

  it("shows planned banks without looking like they already work", () => {
    const planned = getPlannedImportCsvOnboardingCards();
    expect(planned.map((card) => card.providerId)).toEqual(["itau"]);
    expect(planned[0]?.status).toBe("planned");
    expect(planned[0]?.layouts.every((layout) => layout.steps === null)).toBe(
      true,
    );
  });

  it("keeps planned layouts under supported banks without detailed steps", () => {
    const cards = buildImportCsvOnboardingCards();
    const inter = cards.find((card) => card.providerId === "inter");
    const cardLayout = inter?.layouts.find(
      (layout) => layout.kind === "credit_card",
    );

    expect(cardLayout).toMatchObject({
      status: "planned",
      steps: null,
      shortLabel: "cartão",
    });
  });
});
