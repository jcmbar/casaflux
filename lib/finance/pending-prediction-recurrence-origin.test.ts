import { describe, expect, it } from "vitest";

import {
  getPendingPredictionRecurrenceOrigin,
  getRecurrenceRowElementId,
} from "./pending-prediction-recurrence-origin";

describe("getPendingPredictionRecurrenceOrigin", () => {
  it("returns null for standalone pending predictions", () => {
    expect(getPendingPredictionRecurrenceOrigin(null, undefined)).toBeNull();
    expect(getPendingPredictionRecurrenceOrigin(undefined, null)).toBeNull();
    expect(
      getPendingPredictionRecurrenceOrigin(null, { isPaused: true }),
    ).toBeNull();
  });

  it("labels pending predictions from an active recurrence and allows navigation", () => {
    expect(
      getPendingPredictionRecurrenceOrigin("rec-1", { isPaused: false }),
    ).toEqual({
      label: "Recorrente",
      isPaused: false,
      canNavigate: true,
    });
  });

  it("labels pending predictions from a paused recurrence and allows navigation", () => {
    expect(
      getPendingPredictionRecurrenceOrigin("rec-1", { isPaused: true }),
    ).toEqual({
      label: "Recorrente (pausada)",
      isPaused: true,
      canNavigate: true,
    });
  });

  it("keeps the badge without navigation when the recurrence cannot be found", () => {
    expect(getPendingPredictionRecurrenceOrigin("rec-1", null)).toEqual({
      label: "Recorrente",
      isPaused: false,
      canNavigate: false,
    });
    expect(getPendingPredictionRecurrenceOrigin("rec-1", undefined)).toEqual({
      label: "Recorrente",
      isPaused: false,
      canNavigate: false,
    });
  });
});

describe("getRecurrenceRowElementId", () => {
  it("builds a stable DOM id for focusing a recurrence row", () => {
    expect(getRecurrenceRowElementId("rec-42")).toBe("recurrence-row-rec-42");
  });
});
