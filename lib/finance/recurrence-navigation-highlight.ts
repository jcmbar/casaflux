/**
 * Presentation helpers for the temporary highlight when navigating
 * from a pending prediction to its recurrence row.
 */

/** How long the target recurrence row stays visually highlighted. */
export const RECURRENCE_NAVIGATION_HIGHLIGHT_MS = 1800;

export function isRecurrenceRowHighlighted(
  rowId: string,
  highlightedRecurrenceId: string | null,
): boolean {
  return (
    highlightedRecurrenceId !== null && highlightedRecurrenceId === rowId
  );
}

/**
 * Starting a new navigation always replaces any previous highlight target.
 */
export function nextRecurrenceHighlightId(
  _previousHighlightedId: string | null,
  nextRecurrenceId: string,
): string {
  return nextRecurrenceId;
}

export function clearRecurrenceHighlightIfCurrent(
  currentHighlightedId: string | null,
  targetId: string,
): string | null {
  return currentHighlightedId === targetId ? null : currentHighlightedId;
}

/** Tailwind/utility class applied while a recurrence row is temporarily highlighted. */
export function getRecurrenceNavigationHighlightClassName(
  isHighlighted: boolean,
): string {
  return isHighlighted ? "recurrence-nav-highlight" : "";
}
