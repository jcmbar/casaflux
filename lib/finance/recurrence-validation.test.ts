import { describe, expect, it } from "vitest";

import { getRecurrenceEndValidationError } from "./recurrence-validation";

describe("getRecurrenceEndValidationError", () => {
  it("accepts a recurrence without an end", () => {
    expect(
      getRecurrenceEndValidationError({
        startDate: "2026-07-17",
        endType: "never",
        endDate: null,
        occurrencesLimit: null,
      }),
    ).toBeNull();
  });

  it("rejects an end date before the start date", () => {
    expect(
      getRecurrenceEndValidationError({
        startDate: "2026-07-17",
        endType: "until_date",
        endDate: "2026-07-16",
        occurrencesLimit: null,
      }),
    ).toBe("A data final deve ser igual ou posterior à data inicial.");
  });

  it("accepts an end date equal to the start date", () => {
    expect(
      getRecurrenceEndValidationError({
        startDate: "2026-07-17",
        endType: "until_date",
        endDate: "2026-07-17",
        occurrencesLimit: null,
      }),
    ).toBeNull();
  });

  it("requires a positive integer occurrence limit", () => {
    expect(
      getRecurrenceEndValidationError({
        startDate: "2026-07-17",
        endType: "occurrences_count",
        endDate: null,
        occurrencesLimit: 0,
      }),
    ).toBe("Informe uma quantidade válida de ocorrências.");

    expect(
      getRecurrenceEndValidationError({
        startDate: "2026-07-17",
        endType: "occurrences_count",
        endDate: null,
        occurrencesLimit: 3,
      }),
    ).toBeNull();
  });
});
