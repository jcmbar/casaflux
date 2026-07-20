import type { CreateRecurrenceInput } from "@/lib/finance/create-recurrence";
import { getCreatePredictionValidationError } from "@/lib/finance/predictions";
import { getRecurrenceEndValidationError } from "@/lib/finance/recurrence-validation";
import type { RecurrenceEndType, RecurrenceFrequency } from "@/types/recurrence";

export type PredictionRecurrenceFormInput = {
  isRecurring: boolean;
  description: string;
  amount: number;
  scheduledDate: string;
  accountId: string;
  categoryId: string | null;
  type: "expense" | "income";
  includeInProjection: boolean;
  frequency: RecurrenceFrequency;
  endType: RecurrenceEndType;
  endDate: string;
  occurrencesLimit: string;
};

export function shouldCreatePredictionAsRecurrence(
  input: Pick<PredictionRecurrenceFormInput, "isRecurring">,
  options: { isEditing: boolean },
): boolean {
  return !options.isEditing && input.isRecurring;
}

export function getPredictionRecurrenceSubmitValidationError(
  input: PredictionRecurrenceFormInput,
  options: { isEditing: boolean },
): string | null {
  const baseError = getCreatePredictionValidationError({
    description: input.description,
    amount: input.amount,
    scheduledDate: input.scheduledDate,
  });

  if (baseError) {
    return baseError;
  }

  if (!shouldCreatePredictionAsRecurrence(input, options)) {
    return null;
  }

  if (!input.accountId) {
    return "Selecione uma conta para criar uma recorrência.";
  }

  const parsedOccurrencesLimit = Number(input.occurrencesLimit);

  return getRecurrenceEndValidationError({
    startDate: input.scheduledDate,
    endType: input.endType,
    endDate: input.endDate || null,
    occurrencesLimit:
      input.endType === "occurrences_count" ? parsedOccurrencesLimit : null,
  });
}

/**
 * Maps the prediction form to a recurrence template.
 * The scheduled date becomes start_date, so the first pending prediction
 * is generated on that same date (no duplicate standalone row).
 */
export function buildCreateRecurrenceInputFromPredictionForm(
  input: PredictionRecurrenceFormInput,
  context: {
    ownerUserId: string;
    familyId: string | null;
    accountId: string;
  },
): CreateRecurrenceInput {
  const parsedOccurrencesLimit = Number(input.occurrencesLimit);

  return {
    ownerUserId: context.ownerUserId,
    familyId: context.familyId,
    accountId: context.accountId,
    categoryId: input.categoryId,
    type: input.type,
    description: input.description.trim(),
    amount: input.amount,
    frequency: input.frequency,
    startDate: input.scheduledDate,
    endType: input.endType,
    endDate: input.endType === "until_date" ? input.endDate : null,
    occurrencesLimit:
      input.endType === "occurrences_count" ? parsedOccurrencesLimit : null,
    autoConfirm: false,
    includeInProjection: input.includeInProjection,
  };
}
