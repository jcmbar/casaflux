import { describe, expect, it } from "vitest";

import {
  buildCreateRecurrenceInputFromPredictionForm,
  getPredictionRecurrenceSubmitValidationError,
  shouldCreatePredictionAsRecurrence,
} from "./prediction-recurrence-submit";

const baseForm = {
  isRecurring: false,
  description: "Aluguel",
  amount: 1500,
  scheduledDate: "2026-08-05",
  accountId: "account-1",
  categoryId: "category-1",
  type: "expense" as const,
  includeInProjection: true,
  frequency: "monthly" as const,
  endType: "never" as const,
  endDate: "",
  occurrencesLimit: "",
};

describe("shouldCreatePredictionAsRecurrence", () => {
  it("creates a recurrence only for new recurring predictions", () => {
    expect(
      shouldCreatePredictionAsRecurrence(
        { isRecurring: true },
        { isEditing: false },
      ),
    ).toBe(true);
    expect(
      shouldCreatePredictionAsRecurrence(
        { isRecurring: true },
        { isEditing: true },
      ),
    ).toBe(false);
    expect(
      shouldCreatePredictionAsRecurrence(
        { isRecurring: false },
        { isEditing: false },
      ),
    ).toBe(false);
  });
});

describe("getPredictionRecurrenceSubmitValidationError", () => {
  it("accepts a standalone prediction without account", () => {
    expect(
      getPredictionRecurrenceSubmitValidationError(
        { ...baseForm, accountId: "" },
        { isEditing: false },
      ),
    ).toBeNull();
  });

  it("requires account and valid end rule for recurring predictions", () => {
    expect(
      getPredictionRecurrenceSubmitValidationError(
        { ...baseForm, isRecurring: true, accountId: "" },
        { isEditing: false },
      ),
    ).toBe("Selecione uma conta para criar uma recorrência.");

    expect(
      getPredictionRecurrenceSubmitValidationError(
        {
          ...baseForm,
          isRecurring: true,
          endType: "occurrences_count",
          occurrencesLimit: "0",
        },
        { isEditing: false },
      ),
    ).toBe("Informe uma quantidade válida de ocorrências.");
  });
});

describe("buildCreateRecurrenceInputFromPredictionForm", () => {
  it("uses the scheduled date as the recurrence start date", () => {
    const input = buildCreateRecurrenceInputFromPredictionForm(
      {
        ...baseForm,
        isRecurring: true,
        description: "  Aluguel  ",
        scheduledDate: "2026-08-05",
        endType: "until_date",
        endDate: "2027-08-05",
      },
      {
        ownerUserId: "user-1",
        familyId: null,
        accountId: "account-1",
      },
    );

    expect(input.startDate).toBe("2026-08-05");
    expect(input.description).toBe("Aluguel");
    expect(input.endDate).toBe("2027-08-05");
    expect(input.autoConfirm).toBe(false);
    expect(input.includeInProjection).toBe(true);
  });
});
