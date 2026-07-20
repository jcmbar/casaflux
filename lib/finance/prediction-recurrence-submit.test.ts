import { describe, expect, it } from "vitest";

import {
  RECURRENCE_END_TYPE_LABELS,
  RECURRENCE_FREQUENCY_LABELS,
} from "./recurrence-labels";
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
  it("keeps non-recurring prediction creation without account", () => {
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

  it("accepts recurring monthly with no end date", () => {
    expect(
      getPredictionRecurrenceSubmitValidationError(
        {
          ...baseForm,
          isRecurring: true,
          frequency: "monthly",
          endType: "never",
        },
        { isEditing: false },
      ),
    ).toBeNull();
  });

  it("accepts recurring weekly and biweekly with until_date", () => {
    expect(
      getPredictionRecurrenceSubmitValidationError(
        {
          ...baseForm,
          isRecurring: true,
          frequency: "weekly",
          endType: "until_date",
          endDate: "2026-12-05",
        },
        { isEditing: false },
      ),
    ).toBeNull();

    expect(
      getPredictionRecurrenceSubmitValidationError(
        {
          ...baseForm,
          isRecurring: true,
          frequency: "biweekly",
          endType: "until_date",
          endDate: "2026-12-05",
        },
        { isEditing: false },
      ),
    ).toBeNull();
  });
});

describe("buildCreateRecurrenceInputFromPredictionForm", () => {
  it("maps a monthly recurring prediction without end date", () => {
    const input = buildCreateRecurrenceInputFromPredictionForm(
      {
        ...baseForm,
        isRecurring: true,
        frequency: "monthly",
        endType: "never",
      },
      {
        ownerUserId: "user-1",
        familyId: null,
        accountId: "account-1",
      },
    );

    expect(input).toMatchObject({
      frequency: "monthly",
      startDate: "2026-08-05",
      endType: "never",
      endDate: null,
      occurrencesLimit: null,
      autoConfirm: false,
    });
  });

  it("maps weekly and biweekly recurring predictions", () => {
    const weekly = buildCreateRecurrenceInputFromPredictionForm(
      {
        ...baseForm,
        isRecurring: true,
        frequency: "weekly",
        endType: "never",
      },
      {
        ownerUserId: "user-1",
        familyId: "family-1",
        accountId: "account-1",
      },
    );
    const biweekly = buildCreateRecurrenceInputFromPredictionForm(
      {
        ...baseForm,
        isRecurring: true,
        frequency: "biweekly",
        endType: "until_date",
        endDate: "2027-01-01",
      },
      {
        ownerUserId: "user-1",
        familyId: "family-1",
        accountId: "account-1",
      },
    );

    expect(weekly.frequency).toBe("weekly");
    expect(biweekly.frequency).toBe("biweekly");
    expect(biweekly.endDate).toBe("2027-01-01");
  });

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

describe("recurrence product labels", () => {
  it("uses everyday language for frequencies and end rules", () => {
    expect(RECURRENCE_FREQUENCY_LABELS.monthly).toBe("Todo mês");
    expect(RECURRENCE_FREQUENCY_LABELS.weekly).toBe("Toda semana");
    expect(RECURRENCE_FREQUENCY_LABELS.biweekly).toBe("A cada 2 semanas");
    expect(RECURRENCE_FREQUENCY_LABELS.yearly).toBe("Todo ano");
    expect(RECURRENCE_END_TYPE_LABELS.never).toBe("Sem data final");
  });
});
