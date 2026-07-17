export type PredictionDiff =
  | { kind: "equal" }
  | { kind: "above"; amount: number }
  | { kind: "below"; amount: number };

/**
 * Compares a predicted amount with the actual (settled) amount.
 * Works in cents to avoid floating-point equality issues.
 */
export function getPredictionDiff(
  predictedAmount: number,
  actualAmount: number,
): PredictionDiff {
  const predictedCents = Math.round(predictedAmount * 100);
  const actualCents = Math.round(actualAmount * 100);
  const diffCents = actualCents - predictedCents;

  if (diffCents === 0) {
    return { kind: "equal" };
  }

  if (diffCents > 0) {
    return { kind: "above", amount: diffCents / 100 };
  }

  return { kind: "below", amount: -diffCents / 100 };
}
