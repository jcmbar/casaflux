import { describe, expect, it } from "vitest";

import { getPredictionDiff } from "./prediction-diff";

describe("getPredictionDiff", () => {
  it("detects equal amounts", () => {
    expect(getPredictionDiff(44.44, 44.44)).toEqual({ kind: "equal" });
  });

  it("is robust to floating-point noise", () => {
    expect(getPredictionDiff(0.3, 0.1 + 0.2)).toEqual({ kind: "equal" });
  });

  it("detects amounts above the prediction", () => {
    expect(getPredictionDiff(100, 112.5)).toEqual({
      kind: "above",
      amount: 12.5,
    });
  });

  it("detects amounts below the prediction", () => {
    expect(getPredictionDiff(100, 87.5)).toEqual({
      kind: "below",
      amount: 12.5,
    });
  });
});
