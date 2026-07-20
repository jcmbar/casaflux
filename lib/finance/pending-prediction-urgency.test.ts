import { describe, expect, it } from "vitest";

import { getPendingPredictionRecurrenceOrigin } from "./pending-prediction-recurrence-origin";
import {
  formatPendingPredictionUrgencySummary,
  getPendingPredictionUrgency,
  groupPendingPredictionsByUrgency,
  PENDING_PREDICTION_URGENCY_LABELS,
} from "./pending-prediction-urgency";

describe("getPendingPredictionUrgency", () => {
  it("classifies overdue, due today, and upcoming dates", () => {
    expect(getPendingPredictionUrgency("2026-07-19", "2026-07-20")).toBe(
      "overdue",
    );
    expect(getPendingPredictionUrgency("2026-07-20", "2026-07-20")).toBe(
      "due_today",
    );
    expect(getPendingPredictionUrgency("2026-07-21", "2026-07-20")).toBe(
      "upcoming",
    );
  });
});

describe("groupPendingPredictionsByUrgency", () => {
  it("groups in urgency order and preserves relative order within each bucket", () => {
    const groups = groupPendingPredictionsByUrgency(
      [
        { id: "u1", scheduledDate: "2026-07-22" },
        { id: "o1", scheduledDate: "2026-07-10" },
        { id: "t1", scheduledDate: "2026-07-20" },
        { id: "o2", scheduledDate: "2026-07-15" },
        { id: "u2", scheduledDate: "2026-07-25" },
      ],
      "2026-07-20",
    );

    expect(groups.map((group) => group.urgency)).toEqual([
      "overdue",
      "due_today",
      "upcoming",
    ]);
    expect(groups[0]).toMatchObject({
      label: PENDING_PREDICTION_URGENCY_LABELS.overdue,
      items: [{ id: "o1" }, { id: "o2" }],
    });
    expect(groups[1]).toMatchObject({
      label: PENDING_PREDICTION_URGENCY_LABELS.due_today,
      items: [{ id: "t1" }],
    });
    expect(groups[2]).toMatchObject({
      label: PENDING_PREDICTION_URGENCY_LABELS.upcoming,
      items: [{ id: "u1" }, { id: "u2" }],
    });
  });

  it("omits empty urgency buckets", () => {
    const groups = groupPendingPredictionsByUrgency(
      [{ id: "t1", scheduledDate: "2026-07-20" }],
      "2026-07-20",
    );

    expect(groups).toEqual([
      {
        urgency: "due_today",
        label: "Vence hoje",
        items: [{ id: "t1", scheduledDate: "2026-07-20" }],
      },
    ]);
  });
});

describe("formatPendingPredictionUrgencySummary", () => {
  it("builds a compact urgency summary", () => {
    expect(
      formatPendingPredictionUrgencySummary(
        [
          { scheduledDate: "2026-07-10" },
          { scheduledDate: "2026-07-10" },
          { scheduledDate: "2026-07-20" },
          { scheduledDate: "2026-07-22" },
        ],
        "2026-07-20",
      ),
    ).toBe("2 atrasadas · 1 vence hoje · 1 próxima");
  });

  it("returns null for an empty list", () => {
    expect(formatPendingPredictionUrgencySummary([], "2026-07-20")).toBeNull();
  });
});

describe("urgency with recurrence origin labels", () => {
  it("keeps urgency independent from recurrence origin presentation", () => {
    const prediction = {
      id: "p1",
      scheduledDate: "2026-07-19",
      recurrenceId: "rec-1",
    };
    const urgency = getPendingPredictionUrgency(
      prediction.scheduledDate,
      "2026-07-20",
    );
    const origin = getPendingPredictionRecurrenceOrigin(
      prediction.recurrenceId,
      { isPaused: true },
    );

    expect(urgency).toBe("overdue");
    expect(origin).toEqual({
      label: "Recorrente (pausada)",
      isPaused: true,
      canNavigate: true,
    });
  });
});
