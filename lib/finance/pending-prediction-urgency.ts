/**
 * Presentation-only urgency for pending predictions (overdue / due today / upcoming).
 * Does not change domain scheduling or settlement rules.
 */

export type PendingPredictionUrgency = "overdue" | "due_today" | "upcoming";

export const PENDING_PREDICTION_URGENCY_ORDER: PendingPredictionUrgency[] = [
  "overdue",
  "due_today",
  "upcoming",
];

export const PENDING_PREDICTION_URGENCY_LABELS: Record<
  PendingPredictionUrgency,
  string
> = {
  overdue: "Atrasadas",
  due_today: "Vence hoje",
  upcoming: "Próximas",
};

export function getPendingPredictionUrgency(
  scheduledDate: string,
  today: string,
): PendingPredictionUrgency {
  if (scheduledDate < today) return "overdue";
  if (scheduledDate === today) return "due_today";
  return "upcoming";
}

export type PendingPredictionUrgencyGroup<T extends { scheduledDate: string }> =
  {
    urgency: PendingPredictionUrgency;
    label: string;
    items: T[];
  };

/**
 * Groups predictions by urgency while preserving relative order within each bucket.
 * Empty groups are omitted. Order is always: atrasadas → vence hoje → próximas.
 */
export function groupPendingPredictionsByUrgency<
  T extends { scheduledDate: string },
>(
  predictions: T[],
  today: string,
): PendingPredictionUrgencyGroup<T>[] {
  const buckets: Record<PendingPredictionUrgency, T[]> = {
    overdue: [],
    due_today: [],
    upcoming: [],
  };

  for (const prediction of predictions) {
    buckets[getPendingPredictionUrgency(prediction.scheduledDate, today)].push(
      prediction,
    );
  }

  return PENDING_PREDICTION_URGENCY_ORDER.flatMap((urgency) => {
    const items = buckets[urgency];
    if (items.length === 0) return [];
    return [
      {
        urgency,
        label: PENDING_PREDICTION_URGENCY_LABELS[urgency],
        items,
      },
    ];
  });
}

/** Compact summary line for the Predictions card header. */
export function formatPendingPredictionUrgencySummary(
  predictions: Array<{ scheduledDate: string }>,
  today: string,
): string | null {
  if (predictions.length === 0) return null;

  const counts: Record<PendingPredictionUrgency, number> = {
    overdue: 0,
    due_today: 0,
    upcoming: 0,
  };

  for (const prediction of predictions) {
    counts[getPendingPredictionUrgency(prediction.scheduledDate, today)] += 1;
  }

  const parts: string[] = [];
  if (counts.overdue > 0) {
    parts.push(
      `${counts.overdue} ${counts.overdue === 1 ? "atrasada" : "atrasadas"}`,
    );
  }
  if (counts.due_today > 0) {
    parts.push(
      `${counts.due_today} ${
        counts.due_today === 1 ? "vence hoje" : "vencem hoje"
      }`,
    );
  }
  if (counts.upcoming > 0) {
    parts.push(
      `${counts.upcoming} ${
        counts.upcoming === 1 ? "próxima" : "próximas"
      }`,
    );
  }

  return parts.join(" · ");
}
