import { describe, expect, it } from "vitest";

import {
  getMonthlyPredictionAggregates,
  getMonthlyProjectionDelta,
  getProjectedMonthlyBalance,
} from "./prediction-aggregates";

describe("getMonthlyPredictionAggregates", () => {
  it("sums monthly predictions and their settled amounts", () => {
    const result = getMonthlyPredictionAggregates(
      [
        {
          scheduledDate: "2026-07-05",
          amount: 100,
          status: "settled",
          settledAmount: 115,
        },
        {
          scheduledDate: "2026-07-15",
          amount: 50,
          status: "predicted",
          settledAmount: null,
        },
        {
          scheduledDate: "2026-06-30",
          amount: 900,
          status: "settled",
          settledAmount: 900,
        },
        {
          scheduledDate: "2026-07-20",
          amount: 25,
          status: "canceled",
          settledAmount: null,
        },
      ],
      "2026-07",
    );

    expect(result).toEqual({
      predicted: 150,
      realized: 115,
      delta: -35,
    });
  });

  it("keeps realized at zero when the month only has pending predictions", () => {
    expect(
      getMonthlyPredictionAggregates(
        [
          {
            scheduledDate: "2026-07-10",
            amount: 80,
            status: "predicted",
            settledAmount: null,
          },
        ],
        "2026-07",
      ),
    ).toEqual({
      predicted: 80,
      realized: 0,
      delta: -80,
    });
  });

  it("calculates totals in cents to avoid floating-point noise", () => {
    expect(
      getMonthlyPredictionAggregates(
        [
          {
            scheduledDate: "2026-07-01",
            amount: 0.1,
            status: "settled",
            settledAmount: 0.1,
          },
          {
            scheduledDate: "2026-07-02",
            amount: 0.2,
            status: "settled",
            settledAmount: 0.2,
          },
        ],
        "2026-07",
      ),
    ).toEqual({
      predicted: 0.3,
      realized: 0.3,
      delta: 0,
    });
  });
});

describe("getMonthlyProjectionDelta", () => {
  it("keeps the real balance unchanged without projected items", () => {
    const delta = getMonthlyProjectionDelta([], "2026-07");

    expect(delta).toBe(0);
    expect(getProjectedMonthlyBalance(250, delta)).toBe(250);
  });

  it("adds marked income and subtracts marked expenses", () => {
    const delta = getMonthlyProjectionDelta(
        [
          {
            scheduledDate: "2026-07-20",
            amount: 500,
            type: "income",
            status: "predicted",
            includeInProjection: true,
          },
          {
            scheduledDate: "2026-07-22",
            amount: 125.5,
            type: "expense",
            status: "predicted",
            includeInProjection: true,
          },
        ],
        "2026-07",
      );

    expect(delta).toBe(374.5);
    expect(getProjectedMonthlyBalance(100, delta)).toBe(474.5);
  });

  it("excludes unmarked, settled, canceled and out-of-month items", () => {
    expect(
      getMonthlyProjectionDelta(
        [
          {
            scheduledDate: "2026-07-20",
            amount: 100,
            type: "income",
            status: "predicted",
            includeInProjection: false,
          },
          {
            scheduledDate: "2026-07-21",
            amount: 80,
            type: "expense",
            status: "settled",
            includeInProjection: true,
          },
          {
            scheduledDate: "2026-07-22",
            amount: 70,
            type: "expense",
            status: "canceled",
            includeInProjection: true,
          },
          {
            scheduledDate: "2026-08-01",
            amount: 60,
            type: "expense",
            status: "predicted",
            includeInProjection: true,
          },
        ],
        "2026-07",
      ),
    ).toBe(0);
  });
});
