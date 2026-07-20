import type { SupabaseClient } from "@supabase/supabase-js";

import { addDaysIso, enumerateOccurrenceDates } from "@/lib/finance/recurrence-dates";
import {
  DEFAULT_OCCURRENCE_WINDOW_DAYS,
  notifyRecurrencesChanged,
  syncPredictedOccurrences,
} from "@/lib/finance/recurrence-occurrences";
import { getRecurrenceEndValidationError } from "@/lib/finance/recurrence-validation";
import {
  mapTransactionRecurrence,
  type RecurrenceEndType,
  type RecurrenceFrequency,
  type TransactionRecurrence,
  type TransactionRecurrenceRow,
} from "@/types/recurrence";
import type { TransactionType } from "@/types/transaction";

export type UpdateRecurrenceInput = {
  recurrenceId: string;
  familyId: string | null;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  description: string;
  amount: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  endType: RecurrenceEndType;
  endDate: string | null;
  occurrencesLimit: number | null;
  autoConfirm: boolean;
  includeInProjection: boolean;
};

export type UpdateRecurrenceResult =
  | {
      ok: true;
      recurrence: TransactionRecurrence;
      updatedPredictions: number;
      canceledPredictions: number;
      createdPredictions: number;
    }
  | { ok: false; message: string };

export type PendingPredictionScheduleItem = {
  id: string;
  scheduledDate: string;
};

/**
 * Splits pending predictions into past (before today) and upcoming
 * (today or later). Edit impact stays on upcoming only.
 */
export function partitionPendingPredictionsForEdit(
  pending: readonly PendingPredictionScheduleItem[],
  today: string,
): {
  past: PendingPredictionScheduleItem[];
  upcoming: PendingPredictionScheduleItem[];
} {
  const past: PendingPredictionScheduleItem[] = [];
  const upcoming: PendingPredictionScheduleItem[] = [];

  for (const item of pending) {
    if (item.scheduledDate < today) {
      past.push(item);
    } else {
      upcoming.push(item);
    }
  }

  return { past, upcoming };
}

/**
 * Returns pending prediction ids whose scheduled date no longer belongs
 * to the recurrence rule (e.g. after a frequency or end-rule change).
 *
 * Uses the farther of the sync window and the farthest pending date so
 * out-of-window pending items are still evaluated correctly.
 */
export function getOutdatedPendingPredictionIds(
  schedule: {
    startDate: string;
    frequency: RecurrenceFrequency;
    endType: RecurrenceEndType;
    endDate: string | null;
    occurrencesLimit: number | null;
  },
  pending: readonly PendingPredictionScheduleItem[],
  options: { today?: string; windowDays?: number } = {},
): string[] {
  if (pending.length === 0) return [];

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const windowDays = options.windowDays ?? DEFAULT_OCCURRENCE_WINDOW_DAYS;
  const windowUntil = addDaysIso(today, windowDays);
  const farthestPending = pending.reduce(
    (max, item) => (item.scheduledDate > max ? item.scheduledDate : max),
    windowUntil,
  );
  const until =
    farthestPending > windowUntil ? farthestPending : windowUntil;
  const validDates = new Set(enumerateOccurrenceDates(schedule, until));

  return pending
    .filter((item) => !validDates.has(item.scheduledDate))
    .map((item) => item.id);
}

/**
 * Updates an active recurrence template and keeps **upcoming** pending
 * predictions consistent with the new rule:
 *
 * - upcoming pending predictions receive the new snapshot fields;
 * - upcoming pending dates that leave the schedule are canceled;
 * - missing dates inside the sync window are created;
 * - past pending, settled, and canceled predictions are never touched.
 */
export async function updateRecurrence(
  supabase: SupabaseClient,
  input: UpdateRecurrenceInput,
  options: { today?: string } = {},
): Promise<UpdateRecurrenceResult> {
  if (!input.description.trim()) {
    return { ok: false, message: "Informe uma descrição para a recorrência." };
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "Informe um valor maior que zero." };
  }

  const endValidationError = getRecurrenceEndValidationError({
    startDate: input.startDate,
    endType: input.endType,
    endDate: input.endType === "until_date" ? input.endDate : null,
    occurrencesLimit:
      input.endType === "occurrences_count" ? input.occurrencesLimit : null,
  });

  if (endValidationError) {
    return { ok: false, message: endValidationError };
  }

  const { data, error } = await supabase
    .from("transaction_recurrences")
    .update({
      family_id: input.familyId,
      account_id: input.accountId,
      category_id: input.categoryId,
      type: input.type,
      description: input.description.trim(),
      amount: input.amount,
      frequency: input.frequency,
      start_date: input.startDate,
      end_type: input.endType,
      end_date: input.endType === "until_date" ? input.endDate : null,
      occurrences_limit:
        input.endType === "occurrences_count"
          ? input.occurrencesLimit
          : null,
      auto_confirm: input.autoConfirm,
      include_in_projection: input.includeInProjection,
    })
    .eq("id", input.recurrenceId)
    .eq("is_active", true)
    .select("*")
    .single();

  if (error || !data) {
    console.error(error);
    return {
      ok: false,
      message: "Não foi possível atualizar a recorrência ativa.",
    };
  }

  const recurrence = mapTransactionRecurrence(
    data as TransactionRecurrenceRow,
  );

  const snapshot = {
    family_id: recurrence.familyId,
    account_id: recurrence.accountId,
    category_id: recurrence.categoryId,
    type: recurrence.type,
    description: recurrence.description,
    amount: recurrence.amount,
    include_in_projection: recurrence.includeInProjection,
  };

  const { data: pendingRows, error: pendingError } = await supabase
    .from("financial_predictions")
    .select("id, scheduled_date")
    .eq("recurrence_id", recurrence.id)
    .eq("status", "predicted");

  if (pendingError) {
    console.error(pendingError);
    notifyRecurrencesChanged();
    return {
      ok: false,
      message:
        "A recorrência foi atualizada, mas não foi possível sincronizar as previsões pendentes.",
    };
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const pending = (pendingRows ?? []).map((row) => ({
    id: row.id as string,
    scheduledDate: row.scheduled_date as string,
  }));
  const { upcoming } = partitionPendingPredictionsForEdit(pending, today);

  let updatedPredictions = 0;

  if (upcoming.length > 0) {
    const upcomingIds = upcoming.map((item) => item.id);
    const { data: updatedRows, error: updatePendingError } = await supabase
      .from("financial_predictions")
      .update(snapshot)
      .in("id", upcomingIds)
      .eq("status", "predicted")
      .select("id");

    if (updatePendingError) {
      console.error(updatePendingError);
      notifyRecurrencesChanged();
      return {
        ok: false,
        message:
          "A recorrência foi atualizada, mas não foi possível sincronizar as previsões pendentes.",
      };
    }

    updatedPredictions = updatedRows?.length ?? 0;
  }

  const outdatedIds = getOutdatedPendingPredictionIds(
    {
      startDate: recurrence.startDate,
      frequency: recurrence.frequency,
      endType: recurrence.endType,
      endDate: recurrence.endDate,
      occurrencesLimit: recurrence.occurrencesLimit,
    },
    upcoming,
    { today },
  );

  let canceledPredictions = 0;

  if (outdatedIds.length > 0) {
    const { data: canceledRows, error: cancelError } = await supabase
      .from("financial_predictions")
      .update({ status: "canceled" })
      .in("id", outdatedIds)
      .eq("status", "predicted")
      .select("id");

    if (cancelError) {
      console.error(cancelError);
      notifyRecurrencesChanged();
      return {
        ok: false,
        message:
          "A recorrência foi atualizada, mas não foi possível cancelar previsões fora da nova regra.",
      };
    }

    canceledPredictions = canceledRows?.length ?? 0;
  }

  const syncResult = await syncPredictedOccurrences(supabase, recurrence, {
    today,
  });

  if (!syncResult.ok) {
    notifyRecurrencesChanged();
    return {
      ok: false,
      message:
        "A recorrência foi atualizada, mas não foi possível gerar novas previsões pendentes.",
    };
  }

  notifyRecurrencesChanged();
  return {
    ok: true,
    recurrence,
    updatedPredictions,
    canceledPredictions,
    createdPredictions: syncResult.created,
  };
}
