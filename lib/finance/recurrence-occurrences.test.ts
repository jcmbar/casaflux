import { describe, expect, it } from "vitest";

import {
  planPredictedOccurrences,
  type RecurrencePlanFields,
} from "./recurrence-occurrences";

function recurrence(
  overrides: Partial<RecurrencePlanFields> = {},
): RecurrencePlanFields {
  return {
    startDate: "2026-07-01",
    frequency: "monthly",
    endType: "never",
    endDate: null,
    occurrencesLimit: null,
    isActive: true,
    ...overrides,
  };
}

describe("planPredictedOccurrences", () => {
  it("generates weekly occurrences inside the window", () => {
    const dates = planPredictedOccurrences(
      recurrence({ frequency: "weekly", startDate: "2026-07-17" }),
      [],
      { today: "2026-07-17", windowDays: 21 },
    );

    expect(dates).toEqual([
      "2026-07-17",
      "2026-07-24",
      "2026-07-31",
      "2026-08-07",
    ]);
  });

  it("generates biweekly occurrences inside the window", () => {
    const dates = planPredictedOccurrences(
      recurrence({ frequency: "biweekly", startDate: "2026-07-17" }),
      [],
      { today: "2026-07-17", windowDays: 30 },
    );

    expect(dates).toEqual(["2026-07-17", "2026-07-31", "2026-08-14"]);
  });

  it("generates monthly occurrences inside the default 90-day window", () => {
    const dates = planPredictedOccurrences(
      recurrence({ frequency: "monthly", startDate: "2026-07-10" }),
      [],
      { today: "2026-07-17" },
    );

    expect(dates).toEqual([
      "2026-07-10",
      "2026-08-10",
      "2026-09-10",
      "2026-10-10",
    ]);
  });

  it("generates yearly occurrences only when they fall inside the window", () => {
    const insideWindow = planPredictedOccurrences(
      recurrence({ frequency: "yearly", startDate: "2026-08-01" }),
      [],
      { today: "2026-07-17", windowDays: 90 },
    );
    expect(insideWindow).toEqual(["2026-08-01"]);

    const nextYearOutside = planPredictedOccurrences(
      recurrence({ frequency: "yearly", startDate: "2025-08-01" }),
      ["2025-08-01"],
      { today: "2026-07-17", windowDays: 10 },
    );
    expect(nextYearOutside).toEqual([]);
  });

  it("respects until_date even when the window extends further", () => {
    const dates = planPredictedOccurrences(
      recurrence({
        frequency: "weekly",
        startDate: "2026-07-01",
        endType: "until_date",
        endDate: "2026-07-15",
      }),
      [],
      { today: "2026-07-01", windowDays: 90 },
    );

    expect(dates).toEqual(["2026-07-01", "2026-07-08", "2026-07-15"]);
  });

  it("respects occurrences_count counting occurrences that already exist", () => {
    const dates = planPredictedOccurrences(
      recurrence({
        frequency: "monthly",
        startDate: "2026-05-01",
        endType: "occurrences_count",
        occurrencesLimit: 3,
      }),
      // first two occurrences were already generated (and maybe confirmed)
      ["2026-05-01", "2026-06-01"],
      { today: "2026-07-17", windowDays: 90 },
    );

    expect(dates).toEqual(["2026-07-01"]);
  });

  it("generates nothing for inactive recurrences", () => {
    const dates = planPredictedOccurrences(
      recurrence({ isActive: false }),
      [],
      { today: "2026-07-17", windowDays: 90 },
    );

    expect(dates).toEqual([]);
  });

  it("never recreates occurrences for dates that already exist", () => {
    const dates = planPredictedOccurrences(
      recurrence({ frequency: "weekly", startDate: "2026-07-01" }),
      // existing dates whatever their status (confirmed, skipped, predicted)
      ["2026-07-01", "2026-07-15"],
      { today: "2026-07-01", windowDays: 21 },
    );

    expect(dates).toEqual(["2026-07-08", "2026-07-22"]);
  });

  it("is idempotent: planning again after inserting yields nothing", () => {
    const options = { today: "2026-07-17", windowDays: 30 } as const;
    const config = recurrence({ frequency: "weekly", startDate: "2026-07-17" });

    const firstRun = planPredictedOccurrences(config, [], options);
    const secondRun = planPredictedOccurrences(config, firstRun, options);

    expect(firstRun.length).toBeGreaterThan(0);
    expect(secondRun).toEqual([]);
  });

  it("includes past dates that were never generated", () => {
    const dates = planPredictedOccurrences(
      recurrence({ frequency: "monthly", startDate: "2026-04-10" }),
      [],
      { today: "2026-07-17", windowDays: 0 },
    );

    expect(dates).toEqual(["2026-04-10", "2026-05-10", "2026-06-10", "2026-07-10"]);
  });
});
