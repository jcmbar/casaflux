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
  | "isPaused"
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
 * - Inactive or paused recurrences produce nothing.
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
  if (!recurrence.isActive || recurrence.isPaused) {
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

export type RecurrenceSnapshotFields = Pick<
  TransactionRecurrence,
  | "id"
  | "amount"
  | "ownerUserId"
  | "familyId"
  | "accountId"
  | "categoryId"
  | "type"
  | "description"
  | "includeInProjection"
>;

/**
 * Ensures every scheduled date of the recurrence inside the window has a
 * prediction row, inserting the missing ones with status `predicted`.
 *
 * Each prediction stores a snapshot of the recurrence (description, type,
 * category, expected account), so later edits to the recurrence never
 * rewrite what was predicted.
 *
 * Idempotent: re-running never duplicates dates (guarded here and by the
 * unique index on (recurrence_id, scheduled_date)) and never modifies
 * existing predictions, whatever their status. Template edits that should
 * rewrite upcoming pending rows go through `updateRecurrence`.
 */
export async function syncPredictedOccurrences(
  supabase: SupabaseClient,
  recurrence: RecurrenceSnapshotFields & RecurrencePlanFields,
  options: PlanOccurrencesOptions = {},
): Promise<SyncOccurrencesResult> {
  if (!recurrence.isActive || recurrence.isPaused) {
    return { ok: true, created: 0 };
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from("financial_predictions")
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
    .from("financial_predictions")
    .insert(
      missingDates.map((date) => ({
        recurrence_id: recurrence.id,
        owner_user_id: recurrence.ownerUserId,
        family_id: recurrence.familyId,
        account_id: recurrence.accountId,
        category_id: recurrence.categoryId,
        type: recurrence.type,
        description: recurrence.description,
        scheduled_date: date,
        amount: recurrence.amount,
        status: "predicted",
        include_in_projection: recurrence.includeInProjection,
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
