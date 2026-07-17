import type { SupabaseClient } from "@supabase/supabase-js";

import { getNextMonthKey } from "@/lib/finance/dashboard-stats";
import type { FinanceViewScope } from "@/lib/finance/finance-scope";
import type { PredictionStatus } from "@/types/prediction";

export type PredictionAggregateItem = {
  scheduledDate: string;
  amount: number;
  status: PredictionStatus;
  settledAmount: number | null;
};

export type MonthlyPredictionAggregates = {
  predicted: number;
  realized: number;
  delta: number;
};

type MonthlyPredictionRow = {
  owner_user_id: string;
  family_id: string | null;
  scheduled_date: string;
  amount: number | string;
  status: PredictionStatus;
  settled_amount: number | string | null;
};

export type MonthlyPredictionAggregatesResult = {
  aggregates: MonthlyPredictionAggregates;
  error: Error | null;
};

export function getMonthlyPredictionAggregates(
  predictions: readonly PredictionAggregateItem[],
  monthKey: string,
): MonthlyPredictionAggregates {
  let predictedCents = 0;
  let realizedCents = 0;

  for (const prediction of predictions) {
    if (
      prediction.status === "canceled" ||
      prediction.scheduledDate.slice(0, 7) !== monthKey
    ) {
      continue;
    }

    const predictedAmountCents = Math.round(prediction.amount * 100);
    predictedCents += predictedAmountCents;

    if (prediction.status === "settled") {
      realizedCents +=
        prediction.settledAmount === null
          ? predictedAmountCents
          : Math.round(prediction.settledAmount * 100);
    }
  }

  return {
    predicted: predictedCents / 100,
    realized: realizedCents / 100,
    delta: (realizedCents - predictedCents) / 100,
  };
}

export async function fetchMonthlyPredictionAggregates(
  supabase: SupabaseClient,
  scope: FinanceViewScope,
  monthKey: string,
): Promise<MonthlyPredictionAggregatesResult> {
  const response = await supabase
    .from("financial_predictions")
    .select(
      "owner_user_id, family_id, scheduled_date, amount, status, settled_amount",
    )
    .in("status", ["predicted", "settled"])
    .gte("scheduled_date", `${monthKey}-01`)
    .lt("scheduled_date", `${getNextMonthKey(monthKey)}-01`);

  if (response.error) {
    return {
      aggregates: { predicted: 0, realized: 0, delta: 0 },
      error: response.error,
    };
  }

  const predictions = ((response.data ?? []) as MonthlyPredictionRow[])
    .filter((row) =>
      row.family_id
        ? row.family_id === scope.activeFamilyId
        : row.owner_user_id === scope.userId,
    )
    .map((row) => ({
      scheduledDate: row.scheduled_date,
      amount: Number(row.amount),
      status: row.status,
      settledAmount:
        row.settled_amount === null ? null : Number(row.settled_amount),
    }));

  return {
    aggregates: getMonthlyPredictionAggregates(predictions, monthKey),
    error: null,
  };
}
