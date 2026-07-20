/**
 * Presentation-only labels for pending predictions that come from a recurrence.
 * Does not change domain behavior — callers supply the recurrence pause state.
 */

export type PendingPredictionRecurrenceOrigin = {
  label: "Recorrente" | "Recorrente (pausada)";
  isPaused: boolean;
  /** True when the linked recurrence is available in the current Recorrências list. */
  canNavigate: boolean;
};

export function getPendingPredictionRecurrenceOrigin(
  recurrenceId: string | null | undefined,
  recurrence: { isPaused: boolean } | null | undefined,
): PendingPredictionRecurrenceOrigin | null {
  if (!recurrenceId) return null;

  if (recurrence == null) {
    return {
      label: "Recorrente",
      isPaused: false,
      canNavigate: false,
    };
  }

  if (recurrence.isPaused) {
    return {
      label: "Recorrente (pausada)",
      isPaused: true,
      canNavigate: true,
    };
  }

  return {
    label: "Recorrente",
    isPaused: false,
    canNavigate: true,
  };
}

export function getRecurrenceRowElementId(recurrenceId: string): string {
  return `recurrence-row-${recurrenceId}`;
}
