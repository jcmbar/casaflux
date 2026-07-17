import type { RecurrenceEndType } from "@/types/recurrence";

export type RecurrenceEndInput = {
  startDate: string;
  endType: RecurrenceEndType;
  endDate: string | null;
  occurrencesLimit: number | null;
};

export function getRecurrenceEndValidationError(
  input: RecurrenceEndInput,
): string | null {
  if (
    input.endType === "until_date" &&
    (!input.endDate || input.endDate < input.startDate)
  ) {
    return "A data final deve ser igual ou posterior à data inicial.";
  }

  if (
    input.endType === "occurrences_count" &&
    (!Number.isInteger(input.occurrencesLimit) ||
      (input.occurrencesLimit ?? 0) < 1)
  ) {
    return "Informe uma quantidade válida de ocorrências.";
  }

  return null;
}
