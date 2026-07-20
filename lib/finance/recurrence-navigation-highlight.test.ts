import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECURRENCE_NAVIGATION_HIGHLIGHT_MS,
  clearRecurrenceHighlightIfCurrent,
  getRecurrenceNavigationHighlightClassName,
  isRecurrenceRowHighlighted,
  nextRecurrenceHighlightId,
} from "./recurrence-navigation-highlight";

describe("recurrence navigation highlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("highlights only the navigated recurrence row", () => {
    const highlightedId = nextRecurrenceHighlightId(null, "rec-active");

    expect(isRecurrenceRowHighlighted("rec-active", highlightedId)).toBe(true);
    expect(isRecurrenceRowHighlighted("rec-other", highlightedId)).toBe(false);
    expect(isRecurrenceRowHighlighted("rec-paused", highlightedId)).toBe(false);
  });

  it("replaces the previous highlight when navigating again", () => {
    const first = nextRecurrenceHighlightId(null, "rec-1");
    const second = nextRecurrenceHighlightId(first, "rec-2");

    expect(isRecurrenceRowHighlighted("rec-1", second)).toBe(false);
    expect(isRecurrenceRowHighlighted("rec-2", second)).toBe(true);
  });

  it("clears the highlight automatically after the expected interval", () => {
    let highlightedId: string | null = nextRecurrenceHighlightId(
      null,
      "rec-1",
    );

    const timeoutId = setTimeout(() => {
      highlightedId = clearRecurrenceHighlightIfCurrent(
        highlightedId,
        "rec-1",
      );
    }, RECURRENCE_NAVIGATION_HIGHLIGHT_MS);

    expect(isRecurrenceRowHighlighted("rec-1", highlightedId)).toBe(true);

    vi.advanceTimersByTime(RECURRENCE_NAVIGATION_HIGHLIGHT_MS - 1);
    expect(isRecurrenceRowHighlighted("rec-1", highlightedId)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(highlightedId).toBeNull();
    expect(isRecurrenceRowHighlighted("rec-1", highlightedId)).toBe(false);

    clearTimeout(timeoutId);
  });

  it("does not clear a newer highlight when an older timer fires", () => {
    let highlightedId: string | null = nextRecurrenceHighlightId(
      null,
      "rec-1",
    );

    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      highlightedId = clearRecurrenceHighlightIfCurrent(
        highlightedId,
        "rec-1",
      );
    }, RECURRENCE_NAVIGATION_HIGHLIGHT_MS);

    // Mirrors effect cleanup: a new navigation cancels the previous clear timer.
    if (timer) clearTimeout(timer);
    highlightedId = nextRecurrenceHighlightId(highlightedId, "rec-2");
    timer = setTimeout(() => {
      highlightedId = clearRecurrenceHighlightIfCurrent(
        highlightedId,
        "rec-2",
      );
    }, RECURRENCE_NAVIGATION_HIGHLIGHT_MS);

    vi.advanceTimersByTime(RECURRENCE_NAVIGATION_HIGHLIGHT_MS - 1);
    expect(isRecurrenceRowHighlighted("rec-1", highlightedId)).toBe(false);
    expect(isRecurrenceRowHighlighted("rec-2", highlightedId)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(highlightedId).toBeNull();
  });

  it("exposes a dedicated highlight class without looking like an error state", () => {
    expect(getRecurrenceNavigationHighlightClassName(false)).toBe("");
    expect(getRecurrenceNavigationHighlightClassName(true)).toBe(
      "recurrence-nav-highlight",
    );
    expect(RECURRENCE_NAVIGATION_HIGHLIGHT_MS).toBe(1800);
  });
});
