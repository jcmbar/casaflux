import type { SupabaseClient } from "@supabase/supabase-js";

import {
  notifyRecurrencesChanged,
  syncPredictedOccurrences,
} from "@/lib/finance/recurrence-occurrences";
import { partitionPendingPredictionsForEdit } from "@/lib/finance/update-recurrence";
import {
  mapTransactionRecurrence,
  type TransactionRecurrence,
  type TransactionRecurrenceRow,
} from "@/types/recurrence";

export type PauseRecurrenceResult =
  | { ok: true; canceledUpcomingPredictions: number }
  | { ok: false; message: string };

export type ResumeRecurrenceResult =
  | {
      ok: true;
      recurrence: TransactionRecurrence;
      createdPredictions: number;
    }
  | { ok: false; message: string };

/**
 * Temporarily pauses an active recurrence:
 * - marks the template as paused (no new upcoming predictions);
 * - cancels upcoming pending predictions (scheduled today or later);
 * - leaves past pending, settled, and canceled predictions untouched.
 */
export async function pauseRecurrence(
  supabase: SupabaseClient,
  recurrenceId: string,
  options: { today?: string } = {},
): Promise<PauseRecurrenceResult> {
  const { data: updatedRows, error } = await supabase
    .from("transaction_recurrences")
    .update({ is_paused: true })
    .eq("id", recurrenceId)
    .eq("is_active", true)
    .eq("is_paused", false)
    .select("id");

  if (error) {
    console.error(error);
    return { ok: false, message: "Não foi possível pausar a recorrência." };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      ok: false,
      message: "Apenas recorrências ativas (não pausadas) podem ser pausadas.",
    };
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10);

  const { data: pendingRows, error: pendingError } = await supabase
    .from("financial_predictions")
    .select("id, scheduled_date")
    .eq("recurrence_id", recurrenceId)
    .eq("status", "predicted");

  if (pendingError) {
    console.error(pendingError);
    notifyRecurrencesChanged();
    return {
      ok: false,
      message:
        "A recorrência foi pausada, mas não foi possível atualizar as previsões futuras.",
    };
  }

  const pending = (pendingRows ?? []).map((row) => ({
    id: row.id as string,
    scheduledDate: row.scheduled_date as string,
  }));
  const { upcoming } = partitionPendingPredictionsForEdit(pending, today);

  if (upcoming.length === 0) {
    notifyRecurrencesChanged();
    return { ok: true, canceledUpcomingPredictions: 0 };
  }

  const upcomingIds = upcoming.map((item) => item.id);
  const { data: canceledRows, error: cancelError } = await supabase
    .from("financial_predictions")
    .update({ status: "canceled" })
    .in("id", upcomingIds)
    .eq("status", "predicted")
    .select("id");

  if (cancelError) {
    console.error(cancelError);
    notifyRecurrencesChanged();
    return {
      ok: false,
      message:
        "A recorrência foi pausada, mas não foi possível cancelar as previsões futuras.",
    };
  }

  notifyRecurrencesChanged();
  return {
    ok: true,
    canceledUpcomingPredictions: canceledRows?.length ?? 0,
  };
}

/**
 * Resumes a paused recurrence and materializes missing upcoming predictions.
 */
export async function resumeRecurrence(
  supabase: SupabaseClient,
  recurrenceId: string,
  options: { today?: string } = {},
): Promise<ResumeRecurrenceResult> {
  const { data, error } = await supabase
    .from("transaction_recurrences")
    .update({ is_paused: false })
    .eq("id", recurrenceId)
    .eq("is_active", true)
    .eq("is_paused", true)
    .select("*")
    .single();

  if (error || !data) {
    console.error(error);
    return {
      ok: false,
      message: "Apenas recorrências pausadas podem ser retomadas.",
    };
  }

  const recurrence = mapTransactionRecurrence(
    data as TransactionRecurrenceRow,
  );
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const syncResult = await syncPredictedOccurrences(supabase, recurrence, {
    today,
  });

  if (!syncResult.ok) {
    notifyRecurrencesChanged();
    return {
      ok: false,
      message:
        "A recorrência foi retomada, mas não foi possível gerar as próximas previsões.",
    };
  }

  notifyRecurrencesChanged();
  return {
    ok: true,
    recurrence,
    createdPredictions: syncResult.created,
  };
}
