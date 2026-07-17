import { describe, expect, it } from "vitest";

import { getMonthlyPredictionAggregates } from "./prediction-aggregates";

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
