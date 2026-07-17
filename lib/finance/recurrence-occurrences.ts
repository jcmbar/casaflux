import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addDaysIso,
  enumerateOccurrenceDates,
  formatIsoDate,
} from "@/lib/finance/recurrence-dates";
import type { TransactionRecurrence } from "@/types/recurrence";

export const DEFAULT_OCCURRENCE_WINDOW_DAYS = 90;

export type PlanOccurrencesOptions = {
  /** Reference date (ISO "YYYY-MM-DD"). Defaults to today. */
  today?: string;
  /** How many days ahead of `today` to generate. Defaults to 90. */
  windowDays?: number;
};

export type RecurrencePlanFields = Pick<
  TransactionRecurrence,
  | "startDate"
  | "frequency"
  | "endType"
  | "endDate"
  | "occurrencesLimit"
  | "isActive"
>;

function todayIso(): string {
  return formatIsoDate(new Date());
}

/**
 * Computes which predicted occurrences are missing for a recurrence.
 *
 * Pure function: given the recurrence rules, the dates that already have
 * an occurrence (any status) and a time window, returns the scheduled
 * dates that still need a `predicted` occurrence.
 *
 * - Inactive recurrences produce nothing.
 * - Existing dates are never recreated, so occurrences that were
 *   confirmed or skipped are left untouched.
 * - Past dates since `startDate` are included: a missed date should
 *   surface as a pending prediction, not silently disappear.
 */
export function planPredictedOccurrences(
  recurrence: RecurrencePlanFields,
  existingDates: Iterable<string>,
  options: PlanOccurrencesOptions = {},
): string[] {
  if (!recurrence.isActive) {
    return [];
  }

  const today = options.today ?? todayIso();
  const windowDays = options.windowDays ?? DEFAULT_OCCURRENCE_WINDOW_DAYS;
  const until = addDaysIso(today, windowDays);

  const scheduled = enumerateOccurrenceDates(
    {
      startDate: recurrence.startDate,
      frequency: recurrence.frequency,
      endType: recurrence.endType,
      endDate: recurrence.endDate,
      occurrencesLimit: recurrence.occurrencesLimit,
    },
    until,
  );

  const existing = new Set(existingDates);
  return scheduled.filter((date) => !existing.has(date));
}

export type SyncOccurrencesResult =
  | { ok: true; created: number }
  | { ok: false; message: string };

export function notifyRecurrencesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("casaflux:recurrences-changed"));
  }
}

/**
 * Ensures every scheduled date of the recurrence inside the window has an
 * occurrence row, inserting the missing ones with status `predicted`.
 *
 * Idempotent: re-running never duplicates dates (guarded here and by the
 * unique index on (recurrence_id, scheduled_date)) and never modifies
 * existing occurrences, whatever their status.
 */
export async function syncPredictedOccurrences(
  supabase: SupabaseClient,
  recurrence: Pick<TransactionRecurrence, "id" | "amount"> &
    RecurrencePlanFields,
  options: PlanOccurrencesOptions = {},
): Promise<SyncOccurrencesResult> {
  if (!recurrence.isActive) {
    return { ok: true, created: 0 };
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from("transaction_recurrence_occurrences")
    .select("scheduled_date")
    .eq("recurrence_id", recurrence.id);

  if (fetchError) {
    console.error(fetchError);
    return {
      ok: false,
      message: "Não foi possível carregar as ocorrências existentes.",
    };
  }

  const missingDates = planPredictedOccurrences(
    recurrence,
    (existingRows ?? []).map((row) => row.scheduled_date as string),
    options,
  );

  if (missingDates.length === 0) {
    return { ok: true, created: 0 };
  }

  const { error: insertError } = await supabase
    .from("transaction_recurrence_occurrences")
    .insert(
      missingDates.map((date) => ({
        recurrence_id: recurrence.id,
        scheduled_date: date,
        amount: recurrence.amount,
        status: "predicted",
      })),
    );

  if (insertError) {
    console.error(insertError);
    return {
      ok: false,
      message: "Não foi possível gerar as ocorrências previstas.",
    };
  }

  notifyRecurrencesChanged();
  return { ok: true, created: missingDates.length };
}
